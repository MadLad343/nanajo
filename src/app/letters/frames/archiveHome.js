import { h, svg } from '../../ui/dom.js';
import { EASE_OUT, animate, prefersReducedMotion } from '../../ui/motion.js';
import { renderEntryCard } from '../components/entryCard.js';
import { ENVELOPE_ILLUSTRATION, GLYPHS } from '../components/glyphs.js';
import { createLazyLoader } from '../components/photoAttachment.js';
import { formatDate, formatMonth, formatMonthDay, monthKey } from '../logic/dates.js';

/** Entries rendered per step as the user scrolls back in time. */
const BATCH = 24;

/**
 * @typedef {import('../logic/storage.js').Entry} Entry
 *
 * @typedef {object} ArchiveHomeOptions
 * @property {import('../logic/entries.js').Journal} journal
 * @property {(id: string) => void} openEntry
 * @property {() => void} openSend  Choose entries and send them as one PDF.
 */

/**
 * The Archive: saved entries, newest first, grouped by month, older ones
 * appearing as you scroll. Changes touch only the affected card; the list is
 * never rebuilt wholesale. Writing happens in New Entry, not here; what has
 * not been sent yet is counted above the list, next to Send.
 * @param {ArchiveHomeOptions} options
 * @returns {import('../../ui/pageStack.js').Page}
 */
export function createArchiveHome({ journal, openEntry, openSend }) {
  // --- Header ----------------------------------------------------------------------
  const eyebrow = h('p', { class: 'archive-hero__eyebrow' });
  const meta = h('p', { class: 'archive-hero__meta' });
  const hero = h(
    'header',
    { class: 'archive-hero' },
    eyebrow,
    h('h2', { class: 'archive-hero__title', text: 'Archive' }),
    meta,
  );

  // --- Send --------------------------------------------------------------------------
  const sendTitle = h('span', { class: 'archive-send__title' });
  const sendDetail = h('span', { class: 'archive-send__detail' });
  const sendButton = h(
    'button',
    { class: 'button archive-send__button', attrs: { type: 'button' } },
    svg(GLYPHS.send, { class: 'button__icon' }),
    h('span', { text: '보내기' }),
  );
  sendButton.addEventListener('click', openSend);
  const sendPanel = h(
    'section',
    { class: 'archive-send', attrs: { 'aria-label': '보내기' } },
    h('div', { class: 'archive-send__text' }, sendTitle, sendDetail),
    sendButton,
  );

  // --- Empty state ------------------------------------------------------------------
  const empty = h(
    'div',
    { class: 'archive-empty' },
    svg(ENVELOPE_ILLUSTRATION, { class: 'archive-empty__art', viewBox: '0 0 100 110' }),
    h('h3', { class: 'archive-empty__title', text: '천천히 쓰는 편지' }),
  );

  // --- Timeline ------------------------------------------------------------------------
  const timeline = h('div', { class: 'archive-timeline' });
  const sentinel = h('div', { class: 'archive-sentinel', attrs: { 'aria-hidden': 'true' } });

  const el = h('div', { class: 'archive-home' }, hero, sendPanel, timeline, sentinel, empty);
  // The page scrolls itself, so it is the root for everything loaded lazily.
  const loader = createLazyLoader(el);

  /** @type {Map<string, HTMLElement>} */
  const cards = new Map();
  /** @type {Map<number, { section: HTMLElement, list: HTMLElement }>} */
  const months = new Map();
  let rendered = 0;

  /** @param {Entry} entry @param {'start' | 'end'} where */
  function monthFor(entry, where) {
    const key = monthKey(entry.createdAt, entry.tz);
    let month = months.get(key);
    if (!month) {
      const list = h('div', { class: 'archive-month__entries' });
      const section = h(
        'section',
        { class: 'archive-month' },
        h('h3', { class: 'archive-month__title', text: formatMonth(entry.createdAt, entry.tz) }),
        list,
      );
      month = { section, list };
      months.set(key, month);
      if (where === 'start') timeline.prepend(section);
      else timeline.append(section);
    }
    return month;
  }

  /** @param {Entry} entry */
  const card = (entry) => renderEntryCard(entry, { journal, loader, onOpen: openEntry });

  function renderMore() {
    const list = journal.list();
    for (const entry of list.slice(rendered, rendered + BATCH)) {
      const element = card(entry);
      cards.set(entry.id, element);
      monthFor(entry, 'end').list.append(element);
    }
    rendered = Math.min(list.length, rendered + BATCH);
    sentinel.hidden = rendered >= list.length;
  }

  function reset() {
    cards.clear();
    months.clear();
    timeline.replaceChildren();
    rendered = 0;
    renderMore();
  }

  function showSummary() {
    const { entries, first } = journal.stats();
    const recipient = journal.recipient();
    eyebrow.textContent = recipient ? `${recipient}에게` : '숨겨두는 중!!';
    meta.textContent = first
      ? `할 이야기 ${entries}개 · ${formatDate(first.createdAt, first.tz)}부터`
      : '무!!!!!';
    sendPanel.hidden = entries === 0;
    empty.hidden = entries > 0;
    timeline.hidden = entries === 0;

    const unsent = journal.unsent();
    if (unsent.length) {
      const oldest = unsent[unsent.length - 1];
      const newest = unsent[0];
      const from = formatMonthDay(oldest.createdAt, oldest.tz);
      const to = formatMonthDay(newest.createdAt, newest.tz);
      sendTitle.textContent = `아직 안 보낸 이야기 ${unsent.length}개`;
      sendDetail.textContent = from === to ? from : `${from} – ${to}`;
    } else {
      sendTitle.textContent = '마싯게 머겅!!';
      sendDetail.textContent = '보낸거 또 보내두 돼!!';
    }
  }

  /** @param {import('../logic/entries.js').JournalChange} change */
  function onChange(change) {
    if (change.type === 'draft') return;
    if (change.type === 'meta') return showSummary();
    showSummary();
    const { entry } = change;

    if (change.type === 'update') {
      const old = cards.get(entry.id);
      if (!old) return;
      const next = card(entry);
      old.replaceWith(next);
      cards.set(entry.id, next);
      return;
    }

    if (change.type === 'remove') {
      const old = cards.get(entry.id);
      if (!old) return;
      const list = old.parentElement;
      old.remove();
      cards.delete(entry.id);
      rendered -= 1;
      if (list && !list.childElementCount) {
        months.delete(monthKey(entry.createdAt, entry.tz));
        list.parentElement?.remove();
      }
      return;
    }

    // New entries are dated now, so they belong at the top; anything else is
    // unusual enough (a changed device clock) to simply re-render.
    if (journal.list()[0] !== entry) return reset();
    const element = card(entry);
    cards.set(entry.id, element);
    monthFor(entry, 'start').list.prepend(element);
    rendered += 1;
    if (!prefersReducedMotion()) {
      animate(element, [{ opacity: 0, transform: 'translateY(-10px) scale(0.98)' }, { opacity: 1, transform: 'none' }], {
        duration: 520,
        delay: 180,
        easing: EASE_OUT,
      });
    }
  }

  // Older entries load as the sentinel nears the screen.
  const observer =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(
          (entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            renderMore();
            // Observing again re-checks at once, so loading continues while
            // the end is still within reach.
            observer?.unobserve(sentinel);
            if (!sentinel.hidden) observer?.observe(sentinel);
          },
          { root: el, rootMargin: '1200px 0px' },
        )
      : null;
  if (observer) observer.observe(sentinel);

  reset();
  if (!observer) while (rendered < journal.list().length) renderMore();
  showSummary();
  const unsubscribe = journal.subscribe(onChange);

  return {
    el,
    // The large title is on the page itself; pages above say "Archive" on their back button.
    title: '',
    backLabel: 'Archive',
    destroy() {
      unsubscribe();
      observer?.disconnect();
      loader.disconnect();
    },
  };
}
