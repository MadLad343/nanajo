import { h, svg } from '../../ui/dom.js';
import { uniqueId } from '../../ui/list.js';
import { confirmSheet } from '../components/confirmSheet.js';
import { GLYPHS } from '../components/glyphs.js';
import { createLazyLoader, renderPhoto } from '../components/photoAttachment.js';
import { MAX_PHOTOS_PER_ENTRY, MAX_TEXT } from '../logic/entries.js';
import { renderEntryBody } from './entryViewer.js';

const DRAFT_DELAY_MS = 600;

/**
 * @typedef {import('../logic/storage.js').PhotoRef} PhotoRef
 * @typedef {import('../logic/storage.js').Draft} Draft
 *
 * @typedef {object} EntryEditorOptions
 * @property {import('../logic/entries.js').Journal} journal
 * @property {Draft | null} draft  Unsaved work to continue.
 * @property {HTMLElement} host  Where confirmation sheets appear.
 * @property {(page: import('../../ui/pageStack.js').Page) => Promise<void>} push  Shows the review step above the editor.
 * @property {(outcome: 'saved' | 'discarded') => Promise<void> | void} leave  Takes the user away once the entry is saved or discarded.
 * @property {(message: string) => void} notify
 * @property {(error: unknown, message: string) => void} report
 */

/**
 * Writing one new entry. Work in progress is kept as a draft, saved as you
 * type, so leaving the screen or the app closing loses nothing. The entry is
 * saved from the review step, which shows it as it will be kept: once saved
 * it is sealed and can't be changed.
 * @param {EntryEditorOptions} options
 * @returns {import('../../ui/pageStack.js').Page}
 */
export function createEntryEditor({ journal, draft, host, push, leave, notify, report }) {
  let text = draft?.text ?? '';
  /** @type {PhotoRef[]} */
  let photos = [...(draft?.photos ?? [])];
  let adding = 0;
  let finished = false;

  // --- Date line ------------------------------------------------------------------
  const stamp = h(
    'p',
    { class: 'entry-editor__stamp' },
    h('strong', { text: 'New entry' }),
    h('span', { text: '오늘 이야기를 들려줘!' }),
  );

  // --- Text -------------------------------------------------------------------------
  const textarea = h('textarea', {
    class: 'entry-editor__text letter-prose',
    attrs: {
      placeholder: '오늘은 말이야…',
      'aria-label': '오늘 이야기',
      maxlength: String(MAX_TEXT),
      autocapitalize: 'sentences',
      rows: '8',
    },
  });
  textarea.value = text;
  const grow = () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(textarea.scrollHeight, 180)}px`;
  };
  textarea.addEventListener('input', () => {
    text = textarea.value;
    grow();
    scheduleDraft();
    syncActions();
  });

  // --- Photos ------------------------------------------------------------------------
  const inputId = uniqueId('letter-photos');
  const fileInput = h('input', {
    class: 'visually-hidden',
    attrs: { id: inputId, type: 'file', accept: 'image/*', multiple: '', tabindex: '-1', 'aria-hidden': 'true' },
  });
  const addTile = h(
    'label',
    { class: 'entry-editor__add', attrs: { for: inputId, role: 'button', tabindex: '0' } },
    svg(GLYPHS.photo, { class: 'entry-editor__add-icon' }),
    h('span', { text: '사진!!' }),
  );
  const strip = h('div', { class: 'entry-editor__photos' });
  const el = h(
    'div',
    { class: 'entry-editor' },
    stamp,
    textarea,
    h('section', { class: 'entry-editor__attachments', attrs: { 'aria-label': '사진' } }, fileInput, strip),
  );
  const loader = createLazyLoader(el);

  function renderStrip() {
    const tiles = photos.map((photo) => {
      const remove = h('button', { class: 'entry-editor__remove', attrs: { type: 'button', 'aria-label': '사진 시러!!' } }, svg(GLYPHS.close));
      remove.addEventListener('click', () => removePhoto(photo));
      return h('div', { class: 'entry-editor__tile' }, renderPhoto({ photo, read: journal.thumbnail, loader, className: 'entry-editor__thumb' }), remove);
    });
    const busy = Array.from({ length: adding }, () => h('div', { class: 'entry-editor__tile is-busy' }, h('div', { class: 'spinner' })));
    strip.replaceChildren(...tiles, ...busy, ...(photos.length + adding < MAX_PHOTOS_PER_ENTRY ? [addTile] : []));
  }

  /** @param {PhotoRef} photo */
  function removePhoto(photo) {
    photos = photos.filter((each) => each.id !== photo.id);
    renderStrip();
    syncActions();
    saveDraft().then(() => journal.discardPhotos([photo]));
  }

  fileInput.addEventListener('change', async () => {
    const files = [...(fileInput.files ?? [])].slice(0, MAX_PHOTOS_PER_ENTRY - photos.length - adding);
    fileInput.value = '';
    if (!files.length) return;
    adding += files.length;
    renderStrip();
    syncActions();
    let failed = 0;
    for (const file of files) {
      try {
        const photo = await journal.addPhoto(file);
        if (finished) {
          journal.discardPhotos([photo]);
          continue;
        }
        photos = [...photos, photo];
      } catch {
        failed += 1;
      } finally {
        adding -= 1;
        if (!finished) renderStrip();
      }
    }
    if (finished) return;
    syncActions();
    await saveDraft();
    if (failed) notify(failed === 1 ? '사진 한장이 이상해ㅠㅠ' : `사진 ${failed}장이 이상해ㅠㅠ`);
  });
  addTile.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    fileInput.click();
  });

  // --- Actions ------------------------------------------------------------------------
  const discard = h('button', { class: 'letter-bar__secondary', text: '지우기', attrs: { type: 'button' } });
  const review = h('button', { class: 'button letter-bar__primary', text: '다 썼어!', attrs: { type: 'button' } });
  el.append(h('div', { class: 'letter-bar' }, discard, review));

  const hasContent = () => Boolean(text.trim()) || photos.length > 0;

  function syncActions() {
    review.disabled = !hasContent() || adding > 0;
  }

  // --- Draft --------------------------------------------------------------------------
  let draftTimer = 0;
  function scheduleDraft() {
    clearTimeout(draftTimer);
    draftTimer = window.setTimeout(saveDraft, DRAFT_DELAY_MS);
  }

  async function saveDraft() {
    clearTimeout(draftTimer);
    draftTimer = 0;
    if (finished) return;
    try {
      if (hasContent()) await journal.saveDraft({ text, photos });
      else if (journal.draft()) await journal.clearDraft();
    } catch (error) {
      report(error, '저장 못했더ㅠㅠ 빨리 저장해바!!');
    }
  }

  discard.addEventListener('click', async () => {
    if (hasContent()) {
      const confirmed = await confirmSheet(host, {
        title: '이거 지우는거 마쟈?',
        message: '지우면 끝이다?',
        confirm: '지울래!',
        cancel: '안지울래!',
      });
      if (!confirmed) return;
    }
    finished = true;
    clearTimeout(draftTimer);
    try {
      await journal.clearDraft();
      // Photos added here that no saved entry uses.
      journal.discardPhotos(photos);
    } catch (error) {
      report(error, '못 지웠더ㅠㅠ');
    }
    await leave('discarded');
  });

  review.addEventListener('click', async () => {
    await saveDraft();
    push(
      createReviewPage({
        text,
        photos,
        journal,
        onSave: async () => {
          try {
            finished = true;
            await journal.create({ text, photos });
          } catch (error) {
            finished = false;
            report(error, '저장 못했더ㅠㅠ 쓴 건 그대로 있어!');
            return;
          }
          await leave('saved');
          notify('Archive에 가바!!');
        },
      }),
    );
  });

  // iOS may end a backgrounded Home Screen app without warning.
  const onHide = () => document.visibilityState === 'hidden' && saveDraft();
  document.addEventListener('visibilitychange', onHide);

  renderStrip();
  syncActions();
  requestAnimationFrame(grow);

  return {
    el,
    title: 'New Entry',
    destroy() {
      document.removeEventListener('visibilitychange', onHide);
      loader.disconnect();
      if (!finished) {
        saveDraft().then(() => journal.announceDraft());
        finished = true;
      }
    },
  };
}

/**
 * The entry exactly as it will be kept, before saving.
 * @param {object} options
 * @param {string} options.text
 * @param {PhotoRef[]} options.photos
 * @param {import('../logic/entries.js').Journal} options.journal
 * @param {() => Promise<void>} options.onSave
 * @returns {import('../../ui/pageStack.js').Page}
 */
function createReviewPage({ text, photos, journal, onSave }) {
  const save = h('button', { class: 'button letter-bar__primary', text: '저장할래!', attrs: { type: 'button' } });
  let saving = false;
  save.addEventListener('click', async () => {
    if (saving) return;
    saving = true;
    save.disabled = true;
    await onSave();
    saving = false;
    save.disabled = false;
  });
  const el = h(
    'div',
    { class: 'entry-review' },
    h(
      'div',
      { class: 'entry-review__note' },
      svg(GLYPHS.lock, { class: 'entry-review__note-icon' }),
      h('p', {
        text: '한번 쓰면 못고쳐!! 누나눈 몽총하니까 꼭 다시 확인해바!!',
      }),
    ),
  );
  const loader = createLazyLoader(el);
  el.append(
    renderEntryBody({ dated: null, text: text.replace(/\s+$/, ''), photos, read: journal.photo, loader }),
    h('div', { class: 'letter-bar' }, save),
  );
  return { el, title: '한번 더 보던가!', destroy: loader.disconnect };
}
