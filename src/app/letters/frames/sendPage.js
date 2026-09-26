import { h } from '../../ui/dom.js';
import { renderGroup } from '../../ui/list.js';
import { formatCardDate, formatDate, formatMonthDay, formatTime } from '../logic/dates.js';
import { canBuildPdf, prepareExport } from '../logic/pdfExport.js';

/**
 * @typedef {import('../logic/storage.js').Entry} Entry
 *
 * @typedef {object} LetterToSend
 * @property {File} file
 * @property {Entry[]} entries  What the PDF holds; marked as sent once it is shared.
 * @property {import('../logic/pdfExport.js').PreparedExport} prepared  Draws the page previews.
 *
 * @typedef {object} SendPageOptions
 * @property {import('../logic/entries.js').Journal} journal
 * @property {(letter: LetterToSend) => void} onReady  Shows the finished PDF, ready to share.
 * @property {(error: unknown, message: string) => void} report
 */

/**
 * Send, step one: choose what goes into the letter. Everything not sent yet is
 * ticked; entries sent before can be added back. The PDF is created here, on
 * the device; the next page previews and shares it.
 * @param {SendPageOptions} options
 * @returns {import('../../ui/pageStack.js').Page}
 */
export function createSendPage({ journal, onReady, report }) {
  const supported = canBuildPdf();
  // Saved entries are sealed, and none can be deleted while this page is open.
  const all = journal.list();
  const unsent = all.filter((entry) => entry.sentAt === null);
  const sentBefore = all.filter((entry) => entry.sentAt !== null);
  const chosen = new Set(unsent.map((entry) => entry.id));
  let building = false;

  /** @type {HTMLInputElement[]} */
  const boxes = [];

  /** @param {Entry} entry */
  function renderRow(entry) {
    const input = h('input', { class: 'send-row__check', attrs: { type: 'checkbox' } });
    input.checked = chosen.has(entry.id);
    input.disabled = building;
    input.addEventListener('change', () => {
      if (input.checked) chosen.add(entry.id);
      else chosen.delete(entry.id);
      update();
    });
    input.dataset.id = entry.id;
    boxes.push(input);

    const words = entry.text.trim().replace(/\s+/g, ' ');
    const photos = entry.photos.length === 1 ? '1 photo' : `${entry.photos.length} photos`;
    const detail =
      entry.sentAt !== null
        ? h('span', { class: 'send-row__detail', text: `Sent ${formatMonthDay(entry.sentAt, null)}` })
        : h('span', { class: words ? 'send-row__preview letter-prose' : 'send-row__detail', text: words || photos });

    return h(
      'label',
      { class: 'send-row' },
      input,
      h('span', { class: 'send-row__text' }, h('span', { class: 'send-row__date', text: formatCardDate(entry.createdAt, entry.tz) }), detail),
      h('span', { class: 'send-row__time', text: formatTime(entry.createdAt, entry.tz) }),
    );
  }

  // --- Not sent yet ---------------------------------------------------------------------
  const toggleAll = h('button', { class: 'send-group__all', attrs: { type: 'button' } });
  toggleAll.addEventListener('click', () => {
    const select = !unsent.every((entry) => chosen.has(entry.id));
    for (const entry of unsent) {
      if (select) chosen.add(entry.id);
      else chosen.delete(entry.id);
    }
    syncBoxes();
    update();
  });
  const unsentGroup = h(
    'section',
    { class: 'group' },
    h('div', { class: 'send-group__head' }, h('h2', { class: 'group__title', text: 'Not sent yet' }), toggleAll),
    h('div', { class: 'group__body' }, ...unsent.map(renderRow)),
  );
  unsentGroup.hidden = unsent.length === 0;

  // --- Sent before: folded away unless it is all there is. Rows are built on first open. --
  const sentBody = h('div', { class: 'group__body' });
  const sentGroup = h(
    'details',
    { class: 'send-sent' },
    h('summary', { class: 'group__title send-sent__summary', text: `Sent before · ${sentBefore.length}` }),
    sentBody,
  );
  sentGroup.hidden = sentBefore.length === 0;
  const fillSent = () => {
    if (!sentBody.childElementCount) sentBody.append(...sentBefore.map(renderRow));
  };
  sentGroup.addEventListener('toggle', () => sentGroup.open && fillSent());
  if (!unsent.length && sentBefore.length) {
    sentGroup.open = true;
    fillSent();
  }

  // --- Summary --------------------------------------------------------------------------
  const count = h('span', { class: 'row__value' });
  const photoCount = h('span', { class: 'row__value' });
  const span = h('span', { class: 'row__value' });
  const summary = renderGroup(
    { title: 'In this letter', footer: 'The name is shown on the cover. Change it in Settings.' },
    summaryRow('For', h('span', { class: 'row__value', text: journal.recipient() || 'Not named' })),
    summaryRow('Entries', count),
    summaryRow('Photos', photoCount),
    summaryRow('Written', span),
  );

  // --- Create -------------------------------------------------------------------------------
  const create = h('button', { class: 'button letter-bar__primary', attrs: { type: 'button' } });
  const progressBar = h('span', { class: 'letter-progress__bar' });
  const progressLabel = h('span', { class: 'letter-progress__label', text: 'Composing…' });
  const progress = h(
    'div',
    { class: 'letter-progress', attrs: { role: 'status' } },
    h('span', { class: 'letter-progress__track' }, progressBar),
    progressLabel,
  );
  progress.hidden = true;
  const unsupported = supported
    ? null
    : h('p', { class: 'group__footer is-error', text: 'Creating PDFs needs iOS 16.4 or later on this iPhone.' });

  const el = h(
    'div',
    { class: 'send-page' },
    h('p', {
      class: 'send-page__intro',
      text: 'Everything not sent yet goes into one PDF, oldest first, each entry under its date. Leave one out, or add one you’ve sent before.',
    }),
    unsentGroup,
    sentGroup,
    summary,
    unsupported,
    progress,
    h('div', { class: 'letter-bar' }, create),
  );

  function picked() {
    return all.filter((entry) => chosen.has(entry.id));
  }

  function syncBoxes() {
    for (const box of boxes) {
      box.checked = chosen.has(box.dataset.id ?? '');
      box.disabled = building;
    }
  }

  function update() {
    const entries = picked();
    const photos = entries.reduce((sum, entry) => sum + entry.photos.length, 0);
    count.textContent = String(entries.length);
    photoCount.textContent = String(photos);
    const oldest = entries.at(-1);
    const newest = entries[0];
    if (!oldest || !newest) span.textContent = '—';
    else {
      const from = formatDate(oldest.createdAt, oldest.tz);
      const to = formatDate(newest.createdAt, newest.tz);
      span.textContent = from === to ? from : `${from} – ${to}`;
    }
    toggleAll.textContent = unsent.every((entry) => chosen.has(entry.id)) ? 'Select None' : 'Select All';
    create.textContent = entries.length
      ? `Create PDF · ${entries.length === 1 ? '1 entry' : `${entries.length} entries`}`
      : 'Choose at least one entry';
    create.disabled = building || !supported || entries.length === 0;
    toggleAll.disabled = building;
  }

  /** @param {number} fraction @param {string} label */
  function setProgress(fraction, label) {
    progressBar.style.transform = `scaleX(${Math.max(0.02, Math.min(1, fraction))})`;
    progressLabel.textContent = label;
  }

  create.addEventListener('click', async () => {
    const entries = picked();
    if (building || !entries.length) return;
    building = true;
    syncBoxes();
    update();
    progress.hidden = false;
    setProgress(0, 'Composing pages…');
    try {
      const prepared = await prepareExport(journal, entries);
      const label = `Writing ${prepared.stats.pages} pages…`;
      setProgress(0.05, label);
      const file = await prepared.build((fraction) => setProgress(0.05 + fraction * 0.95, label));
      onReady({ file, entries, prepared });
    } catch (error) {
      report(error, 'Couldn’t create the PDF.');
    } finally {
      progress.hidden = true;
      building = false;
      syncBoxes();
      update();
    }
  });

  update();
  return { el, title: 'Send' };
}

/** @param {string} label @param {HTMLElement} value */
function summaryRow(label, value) {
  return h('div', { class: 'row' }, h('span', { class: 'row__text' }, h('span', { class: 'row__title', text: label })), value);
}
