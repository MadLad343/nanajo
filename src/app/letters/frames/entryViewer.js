import { h, svg } from '../../ui/dom.js';
import { GLYPHS } from '../components/glyphs.js';
import { createLazyLoader, renderPhoto } from '../components/photoAttachment.js';
import { formatLongDate, formatMonthDay, formatTime } from '../logic/dates.js';

/**
 * @typedef {import('../logic/storage.js').Entry} Entry
 * @typedef {import('../logic/storage.js').PhotoRef} PhotoRef
 */

/**
 * The body of an entry as it is kept: the date it was written, the words and
 * photos. Shared by the viewer and the review step before saving.
 * @param {object} options
 * @param {Node} [options.status]  Shown under the date (the viewer's sent and sealed tags).
 * @param {{ createdAt: number, tz: number | null, modifiedAt: number | null } | null} options.dated  null: not saved yet.
 * @param {string} options.text
 * @param {PhotoRef[]} options.photos
 * @param {(id: string) => Promise<import('../logic/image.js').StoredImage | null>} options.read
 * @param {import('../components/photoAttachment.js').LazyLoader} options.loader
 */
export function renderEntryBody({ dated, text, photos, read, loader, status }) {
  const stamp = dated
    ? h(
        'div',
        { class: 'entry-view__stamp' },
        h('span', { class: 'entry-view__label', text: 'Written' }),
        h('time', {
          class: 'entry-view__date',
          text: formatLongDate(dated.createdAt, dated.tz),
          attrs: { datetime: new Date(dated.createdAt).toISOString() },
        }),
        h('span', { class: 'entry-view__time', text: formatTime(dated.createdAt, dated.tz) }),
        dated.modifiedAt
          ? h('span', {
              class: 'entry-view__edited',
              text: `Edited ${formatLongDate(dated.modifiedAt, dated.tz)}. The date above stays as it was written.`,
            })
          : null,
        status,
      )
    : h(
        'div',
        { class: 'entry-view__stamp' },
        h('span', { class: 'entry-view__label', text: '날짜랑 시간도 확인해!' }),
        h('span', { class: 'entry-view__date', text: 'Will be dated' }),
        h('span', { class: 'entry-view__time', text: `${formatLongDate(Date.now(), null)} · ${formatTime(Date.now(), null)}` }),
      );

  return h(
    'article',
    { class: 'entry-view' },
    stamp,
    text.trim() ? h('div', { class: 'entry-view__text letter-prose', text }) : null,
    photos.length
      ? h('div', { class: 'entry-view__photos' }, ...photos.map((photo) => renderPhoto({ photo, read, loader, className: 'entry-view__photo' })))
      : null,
  );
}

/**
 * @typedef {object} EntryViewerOptions
 * @property {Entry} entry
 * @property {import('../logic/entries.js').Journal} journal
 * @property {(entry: Entry) => void} onDelete  Asks for confirmation first.
 */

/**
 * One entry in full. Saved entries are sealed, so the only action here is
 * Delete; sending happens for many entries at once, from the Archive.
 * @param {EntryViewerOptions} options
 * @returns {import('../../ui/pageStack.js').Page}
 */
export function createEntryViewer({ entry, journal, onDelete }) {
  const remove = h(
    'button',
    { class: 'chip chip--danger', attrs: { type: 'button' } },
    svg(GLYPHS.trash, { class: 'chip__icon' }),
    h('span', { text: 'Delete Entry' }),
  );
  remove.addEventListener('click', () => onDelete(entry));

  const status = h(
    'div',
    { class: 'entry-view__tags' },
    entry.sentAt === null
      ? h('span', { class: 'tag tag--unsent' }, h('span', { class: 'tag__dot' }), h('span', { text: 'Not sent yet' }))
      : h('span', { class: 'tag' }, svg(GLYPHS.check, { class: 'tag__icon' }), h('span', { text: `Sent ${formatMonthDay(entry.sentAt, null)}` })),
    h('span', { class: 'tag' }, svg(GLYPHS.lock, { class: 'tag__icon' }), h('span', { text: 'Kept as written' })),
  );

  const el = h('div', { class: 'entry-viewer' });
  const loader = createLazyLoader(el);
  el.append(
    renderEntryBody({ dated: entry, text: entry.text, photos: entry.photos, read: journal.photo, loader, status }),
    h('div', { class: 'entry-viewer__actions' }, remove),
  );
  return { el, title: '', backLabel: 'Entry', destroy: loader.disconnect };
}
