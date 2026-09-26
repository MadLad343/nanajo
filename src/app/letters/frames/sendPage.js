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
    const photos = `사진 ${entry.photos.length}장`;
    const detail =
      entry.sentAt !== null
        ? h('span', { class: 'send-row__detail', text: `${formatMonthDay(entry.sentAt, null)}에 보냈어` })
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
    h('div', { class: 'send-group__head' }, h('h2', { class: 'group__title', text: '아직 안 보낸 이야기' }), toggleAll),
    h('div', { class: 'group__body' }, ...unsent.map(renderRow)),
  );
  unsentGroup.hidden = unsent.length === 0;

  // --- Sent before: folded away unless it is all there is. Rows are built on first open. --
  const sentBody = h('div', { class: 'group__body' });
  const sentGroup = h(
    'details',
    { class: 'send-sent' },
    h('summary', { class: 'group__title send-sent__summary', text: `전에 보낸 이야기 · ${sentBefore.length}` }),
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
    { title: '이번 편지에는' },
    summaryRow('받는 사람', h('span', { class: 'row__value', text: journal.recipient() || '아직 없음' })),
    summaryRow('이야기', count),
    summaryRow('사진', photoCount),
    summaryRow('기간', span),
  );

  // --- Create -------------------------------------------------------------------------------
  const create = h('button', { class: 'button letter-bar__primary', attrs: { type: 'button' } });
  const progressBar = h('span', { class: 'letter-progress__bar' });
  const progressLabel = h('span', { class: 'letter-progress__label', text: '만드는 중…' });
  const progress = h(
    'div',
    { class: 'letter-progress', attrs: { role: 'status' } },
    h('span', { class: 'letter-progress__track' }, progressBar),
    progressLabel,
  );
  progress.hidden = true;
  const unsupported = supported
    ? null
    : h('p', { class: 'group__footer is-error', text: '누나 핸드폰이 너무 몽총해서 못만드러!!' });

  const el = h(
    'div',
    { class: 'send-page' },
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
    count.textContent = `${entries.length}개`;
    photoCount.textContent = `${photos}장`;
    const oldest = entries.at(-1);
    const newest = entries[0];
    if (!oldest || !newest) span.textContent = '—';
    else {
      const from = formatDate(oldest.createdAt, oldest.tz);
      const to = formatDate(newest.createdAt, newest.tz);
      span.textContent = from === to ? from : `${from} – ${to}`;
    }
    toggleAll.textContent = unsent.every((entry) => chosen.has(entry.id)) ? '다 없애버려!!' : '다 추가할래!!';
    create.textContent = entries.length
      ? `편지 만들기 · 이야기 ${entries.length}개`
      : '몽총해!!';
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
    setProgress(0, '페이지 만드는 중…');
    try {
      const prepared = await prepareExport(journal, entries);
      const label = `${prepared.stats.pages}쪽 쓰는 중…`;
      setProgress(0.05, label);
      const file = await prepared.build((fraction) => setProgress(0.05 + fraction * 0.95, label));
      onReady({ file, entries, prepared });
    } catch (error) {
      report(error, '이상해!!');
    } finally {
      progress.hidden = true;
      building = false;
      syncBoxes();
      update();
    }
  });

  update();
  return { el, title: '보내기' };
}

/** @param {string} label @param {HTMLElement} value */
function summaryRow(label, value) {
  return h('div', { class: 'row' }, h('span', { class: 'row__text' }, h('span', { class: 'row__title', text: label })), value);
}
