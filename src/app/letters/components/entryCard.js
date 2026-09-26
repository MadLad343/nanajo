import { h, svg } from '../../ui/dom.js';
import { formatCardDate, formatLongDate, formatMonthDay, formatTime } from '../logic/dates.js';
import { GLYPHS } from './glyphs.js';
import { renderPhoto } from './photoAttachment.js';

/** Photos shown on a card; the rest are counted on the last tile. */
const MAX_TILES = 4;

/**
 * @typedef {import('../logic/storage.js').Entry} Entry
 *
 * @typedef {object} EntryCardOptions
 * @property {import('../logic/entries.js').Journal} journal
 * @property {import('./photoAttachment.js').LazyLoader} loader
 * @property {(id: string) => void} onOpen
 */

/**
 * One entry in the Archive list: when it was written, the start of what was
 * written, its photos as thumbnails, and whether it has been sent. Opens the
 * full entry.
 * @param {Entry} entry
 * @param {EntryCardOptions} options
 */
export function renderEntryCard(entry, { journal, loader, onOpen }) {
  const when = h(
    'time',
    { class: 'entry-card__when', attrs: { datetime: new Date(entry.createdAt).toISOString() } },
    h('span', { class: 'entry-card__date', text: formatCardDate(entry.createdAt, entry.tz) }),
    h('span', { class: 'entry-card__time', text: formatTime(entry.createdAt, entry.tz) }),
  );

  const text = entry.text.trim() ? h('p', { class: 'entry-card__text letter-prose', text: entry.text }) : null;

  let photos = null;
  if (entry.photos.length) {
    const shown = entry.photos.slice(0, MAX_TILES);
    const extra = entry.photos.length - shown.length;
    photos = h(
      'div',
      { class: `entry-card__photos entry-card__photos--${Math.min(shown.length, 3)}` },
      ...shown.map((photo, i) => {
        const tile = renderPhoto({ photo, read: journal.thumbnail, loader, className: 'entry-card__photo' });
        if (extra > 0 && i === shown.length - 1) tile.append(h('span', { class: 'entry-card__more', text: `+${extra}` }));
        return tile;
      }),
    );
  }

  const sent = entry.sentAt === null ? 'Not sent yet' : `Sent ${formatMonthDay(entry.sentAt, null)}`;
  const status = h(
    'p',
    { class: entry.sentAt === null ? 'entry-card__status is-unsent' : 'entry-card__status' },
    entry.sentAt === null ? h('span', { class: 'entry-card__dot' }) : svg(GLYPHS.check, { class: 'entry-card__check' }),
    // Entries edited before saved ones were sealed still say so.
    h('span', { text: entry.modifiedAt ? `${sent} · Edited` : sent }),
  );

  const card = h(
    'article',
    {
      class: 'entry-card',
      attrs: {
        role: 'button',
        tabindex: '0',
        'aria-label': `Entry written ${formatLongDate(entry.createdAt, entry.tz)}, ${formatTime(entry.createdAt, entry.tz)}. ${sent}.`,
      },
    },
    when,
    text,
    photos,
    status,
  );
  card.dataset.id = entry.id;
  card.addEventListener('click', () => onOpen(entry.id));
  card.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onOpen(entry.id);
  });
  return card;
}
