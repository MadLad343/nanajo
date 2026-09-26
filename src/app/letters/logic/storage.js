import { isStoredImage } from './image.js';

/**
 * The letters' persistence boundary. Every record lives in the app's
 * `letters` namespace (see ../../storage.js):
 *
 *   e:<id>   entry   { createdAt, tz?, modifiedAt?, sentAt?, text, photos?: [{ id, width, height }] }
 *   p:<id>   photo   { type, bytes }   the one kept copy of a photo
 *   t:<id>   thumb   { type, bytes }   small preview for the list
 *   meta             { recipient? }
 *   draft            { text, photos, savedAt } or null
 *
 * A draft may also hold `entryId`, left from when saved entries could be
 * edited. It is ignored, so that unsaved writing carries on as a new entry.
 *
 * Entries hold only small text and photo references; image bytes are separate
 * records, loaded one at a time when shown or exported.
 *
 * @typedef {import('./image.js').StoredImage} StoredImage
 * @typedef {{ id: string, width: number, height: number }} PhotoRef
 *
 * @typedef {object} Entry
 * @property {string} id
 * @property {number} createdAt  When it was written (ms since the epoch). Never changes.
 * @property {number | null} tz  Minutes east of UTC when it was written.
 * @property {number | null} modifiedAt  Last edit, from before saved entries were sealed.
 * @property {number | null} sentAt  When it last went out in a shared letter; null until then.
 * @property {string} text
 * @property {PhotoRef[]} photos
 *
 * @typedef {object} Draft
 * @property {string} text
 * @property {PhotoRef[]} photos
 * @property {number} savedAt
 *
 * @typedef {object} Meta
 * @property {string} recipient
 */

const ENTRY = 'e:';
const PHOTO = 'p:';
const THUMB = 't:';
const META = 'meta';
const DRAFT = 'draft';

/** @param {import('../../storage.js').KeyValueStore} kv */
export function openLetterStore(kv) {
  return {
    /** @returns {Promise<Entry[]>} */
    async loadEntries() {
      /** @type {Entry[]} */
      const entries = [];
      for (const [key, value] of await kv.entries(ENTRY)) {
        const entry = decodeEntry(key.slice(ENTRY.length), value);
        if (entry) entries.push(entry);
      }
      return entries;
    },

    /**
     * Writes the entry; with `clearDraft`, empties the draft in the same
     * transaction so a saved entry can never also linger as a draft.
     * @param {Entry} entry
     * @param {{ clearDraft: boolean }} options
     */
    saveEntry(entry, { clearDraft }) {
      /** @type {Array<[string, unknown]>} */
      const writes = [[ENTRY + entry.id, encodeEntry(entry)]];
      if (clearDraft) writes.push([DRAFT, null]);
      return kv.setMany(writes);
    },

    /** Rewrites several entries in one transaction: all are saved or none. @param {readonly Entry[]} entries */
    saveEntries: (entries) => kv.setMany(entries.map((entry) => [ENTRY + entry.id, encodeEntry(entry)])),

    /** @param {string} id */
    deleteEntry: (id) => kv.remove(ENTRY + id),

    /** @param {string} id @param {StoredImage} photo @param {StoredImage} thumb */
    savePhoto: (id, photo, thumb) =>
      kv.setMany([
        [PHOTO + id, photo],
        [THUMB + id, thumb],
      ]),

    /** @param {string} id @returns {Promise<StoredImage | null>} */
    readPhoto: async (id) => asImage(await kv.get(PHOTO + id)),

    /** @param {string} id @returns {Promise<StoredImage | null>} */
    readThumb: async (id) => asImage(await kv.get(THUMB + id)),

    /** Best effort: a leftover is collected by `storedPhotoIds` cleanup later. @param {Iterable<string>} ids */
    async deletePhotos(ids) {
      for (const id of ids) {
        await kv.remove(PHOTO + id);
        await kv.remove(THUMB + id);
      }
    },

    /** Ids of every stored photo or thumbnail. */
    async storedPhotoIds() {
      const ids = new Set();
      for (const key of await kv.keys()) {
        if (key.startsWith(PHOTO) || key.startsWith(THUMB)) ids.add(key.slice(2));
      }
      return ids;
    },

    /** @returns {Promise<Meta>} */
    async loadMeta() {
      const value = /** @type {{ recipient?: unknown } | undefined} */ (await kv.get(META));
      return { recipient: typeof value?.recipient === 'string' ? value.recipient : '' };
    },

    /** @param {Meta} meta */
    saveMeta: (meta) => kv.set(META, meta.recipient ? { recipient: meta.recipient } : {}),

    /** @returns {Promise<Draft | null>} */
    async loadDraft() {
      const value = /** @type {Record<string, unknown> | null | undefined} */ (await kv.get(DRAFT));
      if (!value || typeof value !== 'object') return null;
      return {
        text: typeof value.text === 'string' ? value.text : '',
        photos: decodePhotos(value.photos),
        savedAt: typeof value.savedAt === 'number' ? value.savedAt : 0,
      };
    },

    /** @param {Draft | null} draft */
    saveDraft: (draft) => kv.set(DRAFT, draft),
  };
}

/** @typedef {ReturnType<typeof openLetterStore>} LetterStore */

/** @param {Entry} entry */
function encodeEntry(entry) {
  /** @type {Record<string, unknown>} */
  const record = { createdAt: entry.createdAt, text: entry.text };
  if (entry.tz !== null) record.tz = entry.tz;
  if (entry.modifiedAt !== null) record.modifiedAt = entry.modifiedAt;
  if (entry.sentAt !== null) record.sentAt = entry.sentAt;
  if (entry.photos.length) record.photos = entry.photos.map(({ id, width, height }) => ({ id, width, height }));
  return record;
}

/** @param {string} id @param {unknown} value @returns {Entry | null} */
function decodeEntry(id, value) {
  if (!value || typeof value !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (value);
  if (typeof record.createdAt !== 'number' || !Number.isFinite(record.createdAt)) return null;
  return {
    id,
    createdAt: record.createdAt,
    tz: typeof record.tz === 'number' ? record.tz : null,
    modifiedAt: typeof record.modifiedAt === 'number' ? record.modifiedAt : null,
    sentAt: typeof record.sentAt === 'number' ? record.sentAt : null,
    text: typeof record.text === 'string' ? record.text : '',
    photos: decodePhotos(record.photos),
  };
}

/** @param {unknown} value @returns {PhotoRef[]} */
function decodePhotos(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (photo) =>
      photo &&
      typeof photo.id === 'string' &&
      typeof photo.width === 'number' &&
      typeof photo.height === 'number' &&
      photo.width > 0 &&
      photo.height > 0,
  );
}

/** @param {unknown} value */
function asImage(value) {
  return isStoredImage(value) ? value : null;
}
