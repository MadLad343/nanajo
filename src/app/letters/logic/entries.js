import { currentOffset } from './dates.js';
import { preparePhoto } from './photos.js';
import { openLetterStore } from './storage.js';

/**
 * @typedef {import('./storage.js').Entry} Entry
 * @typedef {import('./storage.js').PhotoRef} PhotoRef
 * @typedef {import('./storage.js').Draft} Draft
 *
 * @typedef {{ type: 'add' | 'update' | 'remove', entry: Entry }
 *   | { type: 'draft', draft: Draft | null }
 *   | { type: 'meta', recipient: string }} JournalChange
 *
 * @typedef {object} EntryContent
 * @property {string} text
 * @property {PhotoRef[]} photos
 */

/** Longest entry kept; far beyond any letter, it only guards against runaway pastes. */
export const MAX_TEXT = 200_000;
export const MAX_PHOTOS_PER_ENTRY = 30;

/**
 * The journal: chronological, independently timestamped entries. A new
 * entry's time is taken from the device when it is saved. Once saved, an
 * entry is sealed: its words and photos never change. It can be sent (as
 * part of a letter, recorded in `sentAt`) or deleted.
 * @param {import('../../storage.js').KeyValueStore} kv  The app's `letters` namespace.
 */
export async function createJournal(kv) {
  const store = openLetterStore(kv);
  const [loaded, meta, initialDraft] = await Promise.all([store.loadEntries(), store.loadMeta(), store.loadDraft()]);

  /** @type {Map<string, Entry>} */
  const entries = new Map(loaded.map((entry) => [entry.id, entry]));
  let draft = initialDraft;
  let recipient = meta.recipient;
  /** @type {Entry[] | null} Newest first; rebuilt only after a change. */
  let sorted = null;
  /** @type {Set<(change: JournalChange) => void>} */
  const listeners = new Set();
  /**
   * Photos stored this session that may not be in the draft yet (several can
   * be stored before the draft is next saved). Cleanup must never take them.
   * @type {Set<string>}
   */
  const fresh = new Set();

  /** @param {JournalChange} change */
  function emit(change) {
    sorted = null;
    for (const listener of listeners) listener(change);
  }

  /** @param {EntryContent} content */
  function clean(content) {
    const text = content.text.replace(/\r\n?/g, '\n').replace(/\s+$/, '').slice(0, MAX_TEXT);
    const photos = content.photos.slice(0, MAX_PHOTOS_PER_ENTRY);
    if (!text.trim() && !photos.length) throw new Error('An entry needs some words or a photo.');
    return { text, photos };
  }

  /** Photo assets still needed by a saved entry, the draft, or an editor. */
  function referencedPhotoIds() {
    const ids = new Set(fresh);
    for (const entry of entries.values()) for (const photo of entry.photos) ids.add(photo.id);
    for (const photo of draft?.photos ?? []) ids.add(photo.id);
    return ids;
  }

  /** @param {Iterable<PhotoRef>} photos */
  function forgetPhotos(photos) {
    const ids = Array.from(photos, ({ id }) => id);
    for (const id of ids) fresh.delete(id);
    const keep = referencedPhotoIds();
    const unused = ids.filter((id) => !keep.has(id));
    if (unused.length) store.deletePhotos(unused).catch(() => {});
  }

  return {
    /** Newest first. @returns {readonly Entry[]} */
    list() {
      sorted ??= [...entries.values()].sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1));
      return sorted;
    },

    /** @param {string} id */
    get: (id) => entries.get(id) ?? null,

    /** @param {(change: JournalChange) => void} listener */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /**
     * Saves a new entry dated now, and clears the draft it came from.
     * @param {EntryContent} content
     */
    async create(content) {
      const { text, photos } = clean(content);
      /** @type {Entry} */
      const entry = { id: newId(), createdAt: Date.now(), tz: currentOffset(), modifiedAt: null, sentAt: null, text, photos };
      await store.saveEntry(entry, { clearDraft: true });
      entries.set(entry.id, entry);
      draft = null;
      emit({ type: 'add', entry });
      emit({ type: 'draft', draft: null });
      return entry;
    },

    /** @param {string} id */
    async remove(id) {
      const entry = entries.get(id);
      if (!entry) return;
      await store.deleteEntry(id);
      entries.delete(id);
      emit({ type: 'remove', entry });
      forgetPhotos(entry.photos);
    },

    /** Entries not yet sent in any letter, newest first. */
    unsent() {
      return this.list().filter((entry) => entry.sentAt === null);
    },

    /**
     * Records that these entries went out in a letter just shared. One
     * transaction: either all of them are marked or none.
     * @param {readonly string[]} ids
     * @param {number} [at]
     */
    async markSent(ids, at = Date.now()) {
      /** @type {Entry[]} */
      const sent = [];
      for (const id of ids) {
        const entry = entries.get(id);
        if (entry) sent.push({ ...entry, sentAt: at });
      }
      if (!sent.length) return;
      await store.saveEntries(sent);
      for (const entry of sent) entries.set(entry.id, entry);
      for (const entry of sent) emit({ type: 'update', entry });
    },

    // --- Photos ----------------------------------------------------------------------

    /**
     * Reduces and stores a picked photo; the returned reference goes into a
     * draft or entry.
     * @param {Blob} file
     * @returns {Promise<PhotoRef>}
     */
    async addPhoto(file) {
      const prepared = await preparePhoto(file);
      const id = newId();
      await store.savePhoto(id, prepared.photo, prepared.thumb);
      fresh.add(id);
      return { id, width: prepared.width, height: prepared.height };
    },

    /** Deletes photos attached while composing that no entry ended up keeping. @param {Iterable<PhotoRef>} photos */
    discardPhotos: forgetPhotos,

    /** @param {string} id */
    thumbnail: (id) => store.readThumb(id),

    /** @param {string} id */
    photo: (id) => store.readPhoto(id),

    // --- Draft ------------------------------------------------------------------------

    draft: () => draft,

    /**
     * Keeps unsaved writing across app restarts. Not announced to listeners:
     * only the composer changes it while open.
     * @param {Omit<Draft, 'savedAt'>} value
     */
    async saveDraft(value) {
      draft = { ...value, savedAt: Date.now() };
      await store.saveDraft(draft);
    },

    async clearDraft() {
      const photos = draft?.photos ?? [];
      draft = null;
      await store.saveDraft(null);
      emit({ type: 'draft', draft: null });
      forgetPhotos(photos);
    },

    /** Tells listeners (the home screen) that a draft was left behind. */
    announceDraft: () => emit({ type: 'draft', draft }),

    // --- Letter details --------------------------------------------------------------

    recipient: () => recipient,

    /** @param {string} name */
    async setRecipient(name) {
      const value = name.trim().slice(0, 80);
      if (value === recipient) return;
      await store.saveMeta({ recipient: value });
      recipient = value;
      emit({ type: 'meta', recipient: value });
    },

    stats() {
      const list = this.list();
      let photos = 0;
      for (const entry of list) photos += entry.photos.length;
      return { entries: list.length, photos, first: list.at(-1) ?? null, last: list[0] ?? null };
    },

    /** Removes photo records nothing refers to (e.g. after the app was closed mid-edit). */
    async collectGarbage() {
      const stored = await store.storedPhotoIds();
      // Read after the stored ids, so a photo saved meanwhile is already known.
      const keep = referencedPhotoIds();
      const orphans = [...stored].filter((id) => !keep.has(id));
      if (orphans.length) await store.deletePhotos(orphans);
      return orphans.length;
    },
  };
}

/** @typedef {Awaited<ReturnType<typeof createJournal>>} Journal */

function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
