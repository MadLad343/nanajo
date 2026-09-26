import { formatDate, formatLongDate, formatTime } from '../dates.js';

/**
 * Lays the letter out as pages of simple drawing operations. Both the PDF
 * writer and the on-screen preview draw from this, so they always agree.
 * Coordinates are points from the page's top-left; text `y` is the baseline.
 *
 * @typedef {import('./shaper.js').Cluster} Cluster
 * @typedef {import('../storage.js').Entry} Entry
 * @typedef {import('../storage.js').PhotoRef} PhotoRef
 * @typedef {[number, number, number]} Color
 *
 * @typedef {{ kind: 'text', x: number, y: number, size: number, color: Color, tracking: number, clusters: Cluster[] }} TextOp
 * @typedef {{ kind: 'rule', x1: number, y1: number, x2: number, y2: number, width: number, color: Color }} RuleOp
 * @typedef {{ kind: 'dot', x: number, y: number, r: number, color: Color }} DotOp
 * @typedef {{ kind: 'photo', photo: PhotoRef, x: number, y: number, width: number, height: number, radius: number }} PhotoOp
 * @typedef {Array<['M' | 'L', number, number] | ['C', number, number, number, number, number, number] | ['Z']>} Path
 * @typedef {{ kind: 'shape', path: Path, fill: Color | null, stroke: Color | null, width: number }} ShapeOp
 * @typedef {TextOp | RuleOp | DotOp | PhotoOp | ShapeOp} Op
 * @typedef {{ ops: Op[] }} Page
 *
 * @typedef {object} ComposedDocument
 * @property {Page[]} pages
 * @property {{ entries: number, photos: number, pages: number }} stats
 */

/** A5 portrait: a small, book-like page that also reads well on a phone. */
export const PAGE = Object.freeze({ width: 419.53, height: 595.28 });
const MARGIN = Object.freeze({ top: 64, bottom: 66, left: 52, right: 52 });
const CONTENT = Object.freeze({ width: PAGE.width - MARGIN.left - MARGIN.right, height: PAGE.height - MARGIN.top - MARGIN.bottom });
const BOTTOM = PAGE.height - MARGIN.bottom;

export const COLORS = Object.freeze({
  ink: /** @type {Color} */ ([0.12, 0.13, 0.18]),
  soft: /** @type {Color} */ ([0.46, 0.49, 0.56]),
  accent: /** @type {Color} */ ([0.05, 0.5, 0.58]),
  rule: /** @type {Color} */ ([0.76, 0.84, 0.86]),
  paper: /** @type {Color} */ ([0.9, 0.95, 0.96]),
});

const BODY = { size: 11, leading: 17.6, paragraphGap: 5.5 };
const DATE_SIZE = 12.5;
const TIME_SIZE = 9.5;
const SMALL = 7.5;
const PHOTO_GAP = 8;
const PHOTO_MAX_HEIGHT = CONTENT.height * 0.6;
const SEPARATOR = 38;
/** Entries shorter than this share of a page move whole to the next page instead of splitting. */
const KEEP_TOGETHER = 0.42;

/**
 * @param {object} input
 * @param {readonly Entry[]} input.entries  Oldest first.
 * @param {string} input.recipient
 * @param {import('./shaper.js').Shaper} input.shaper
 * @returns {ComposedDocument}
 */
export function composeDocument({ entries, recipient, shaper }) {
  /** @type {Page[]} */
  const pages = [];
  /** @type {Page} */
  let page = { ops: [] };
  let y = 0;
  let photos = 0;

  /** @param {string} string @param {number} size @param {number} tracking */
  const measure = (string, size, tracking = 0) => {
    const clusters = shaper.shape(string, size);
    return { clusters, width: clusters.reduce((sum, c) => sum + c.width, 0) + tracking * Math.max(0, clusters.length - 1) };
  };

  /**
   * @param {string} string @param {number} size @param {Color} color
   * @param {number} x @param {number} baseline
   * @param {{ align?: 'left' | 'center' | 'right', tracking?: number }} [options]
   */
  function text(string, size, color, x, baseline, { align = 'left', tracking = 0 } = {}) {
    const { clusters, width } = measure(string, size, tracking);
    const left = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
    page.ops.push({ kind: 'text', x: left, y: baseline, size, color, tracking, clusters });
    return width;
  }

  /** Centred, wrapped text; returns the height used. @param {string} string @param {number} size @param {Color} color @param {number} top @param {number} leading */
  function centered(string, size, color, top, leading) {
    const lines = shaper.wrap(string, size, CONTENT.width);
    lines.forEach((line, i) => {
      page.ops.push({
        kind: 'text',
        x: PAGE.width / 2 - line.width / 2,
        y: top + size + i * leading,
        size,
        color,
        tracking: 0,
        clusters: line.clusters,
      });
    });
    return lines.length * leading;
  }

  function newPage() {
    page = { ops: [] };
    pages.push(page);
    y = MARGIN.top;
    const top = MARGIN.top - 24;
    text('편지', SMALL, COLORS.soft, MARGIN.left, top, { tracking: 1.4 });
    if (recipient) text(`${recipient}에게`, SMALL, COLORS.soft, PAGE.width - MARGIN.right, top, { align: 'right' });
    page.ops.push({ kind: 'rule', x1: MARGIN.left, y1: top + 8, x2: PAGE.width - MARGIN.right, y2: top + 8, width: 0.5, color: COLORS.rule });
  }

  /** A long entry continues on a new page, labelled with its date. @param {Entry} entry */
  function continueOnNewPage(entry) {
    newPage();
    text(`${formatDate(entry.createdAt, entry.tz)}, 이어서`, 8, COLORS.soft, MARGIN.left, y + 8);
    y += 22;
  }

  const freshPage = () => y === MARGIN.top;

  // --- Cover ---------------------------------------------------------------------------
  pages.push(page);
  const center = PAGE.width / 2;
  const coverTop = PAGE.height * 0.3;
  drawEnvelope(page, center, coverTop + 6);
  let coverY = coverTop + 78;
  text('편지', 16, COLORS.accent, center, coverY, { align: 'center', tracking: 3 });
  page.ops.push({ kind: 'rule', x1: center - 14, y1: coverY + 16, x2: center + 14, y2: coverY + 16, width: 0.8, color: COLORS.accent });
  coverY += 34;
  if (recipient) coverY += centered(`${recipient}에게`, 15, COLORS.ink, coverY, 21) + 12;
  const first = entries[0];
  const last = entries[entries.length - 1];
  if (first && last) {
    const from = formatDate(first.createdAt, first.tz);
    const to = formatDate(last.createdAt, last.tz);
    coverY += centered(from === to ? from : `${from} – ${to}`, 9.5, COLORS.soft, coverY, 14);
    centered(`이야기 ${entries.length}개`, 9.5, COLORS.soft, coverY, 14);
  }

  // --- Entries ----------------------------------------------------------------------------
  newPage();
  for (const entry of entries) {
    photos += entry.photos.length;
    const date = measure(formatLongDate(entry.createdAt, entry.tz), DATE_SIZE);
    const time = measure(formatTime(entry.createdAt, entry.tz), TIME_SIZE);
    const timeInline = date.width + 14 + time.width <= CONTENT.width;
    const headerHeight = timeInline ? 20 : 34;

    /** @type {Array<import('./shaper.js').Line | null>} null marks a blank line. */
    const lines = [];
    /** @type {boolean[]} Whether a line ends its paragraph. */
    const ends = [];
    const paragraphs = entry.text.split('\n');
    while (paragraphs.length && !paragraphs[0].trim()) paragraphs.shift();
    for (const paragraph of paragraphs) {
      if (!paragraph.trim()) {
        lines.push(null);
        ends.push(true);
        continue;
      }
      const wrapped = shaper.wrap(paragraph.replace(/\s+$/, ''), BODY.size, CONTENT.width);
      wrapped.forEach((line, i) => {
        lines.push(line);
        ends.push(i === wrapped.length - 1);
      });
    }
    const rows = photoRows(entry.photos);

    let textHeight = 0;
    lines.forEach((line, i) => {
      textHeight += line ? BODY.leading : BODY.leading * 0.6;
      if (line && ends[i]) textHeight += BODY.paragraphGap;
    });
    const rowsHeight = rows.reduce((sum, row) => sum + row.height + PHOTO_GAP, 0);
    const blockHeight = headerHeight + (lines.length ? 10 + textHeight : 0) + (rows.length ? 12 + rowsHeight : 0);

    // Keep an entry whole when it would otherwise leave only a small part of
    // itself here (a header and a line or two, with its photos overleaf);
    // long entries still start on the current page rather than waste it.
    if (!freshPage()) {
      const remaining = BOTTOM - y - SEPARATOR;
      if (blockHeight <= remaining) separator();
      else {
        const kept = heightBeforeBreak(headerHeight, lines, ends, rows, remaining);
        const small = blockHeight <= CONTENT.height * KEEP_TOGETHER;
        const orphaned = kept < headerHeight + BODY.leading * 3 || (blockHeight <= CONTENT.height && kept < blockHeight * 0.5);
        if (small || orphaned) newPage();
        else separator();
      }
    }

    // Header: when it was written.
    text(date.clusters.map((c) => c.text).join(''), DATE_SIZE, COLORS.accent, MARGIN.left, y + 13);
    const timeText = time.clusters.map((c) => c.text).join('');
    if (timeInline) text(timeText, TIME_SIZE, COLORS.soft, PAGE.width - MARGIN.right, y + 13, { align: 'right' });
    else text(timeText, TIME_SIZE, COLORS.soft, MARGIN.left, y + 28);
    y += headerHeight;

    if (lines.length) y += 10;
    lines.forEach((line, i) => {
      if (!line) {
        if (!freshPage()) y += BODY.leading * 0.6;
        return;
      }
      if (y + BODY.leading > BOTTOM) continueOnNewPage(entry);
      page.ops.push({
        kind: 'text',
        x: MARGIN.left,
        y: y + 12.4,
        size: BODY.size,
        color: COLORS.ink,
        tracking: 0,
        clusters: line.clusters,
      });
      y += BODY.leading;
      if (ends[i]) y += BODY.paragraphGap;
    });

    if (rows.length) y += lines.length ? 12 : 4;
    for (const row of rows) {
      if (y + row.height > BOTTOM) continueOnNewPage(entry);
      for (const item of row.items) {
        page.ops.push({ kind: 'photo', photo: item.photo, x: item.x, y, width: item.width, height: row.height, radius: 5 });
      }
      y += row.height + PHOTO_GAP;
    }
  }

  function separator() {
    const mid = y + SEPARATOR / 2;
    for (const dx of [-11, 0, 11]) page.ops.push({ kind: 'dot', x: PAGE.width / 2 + dx, y: mid, r: 1.25, color: COLORS.rule });
    y += SEPARATOR;
  }

  // Page numbers (the cover has none).
  pages.forEach((each, index) => {
    if (index === 0) return;
    page = each;
    text(String(index + 1), 8, COLORS.soft, PAGE.width / 2, PAGE.height - MARGIN.bottom + 36, { align: 'center' });
  });

  return { pages, stats: { entries: entries.length, photos, pages: pages.length } };
}

/**
 * How much of an entry fits in `space` before the first page break would fall.
 * @param {number} headerHeight
 * @param {Array<import('./shaper.js').Line | null>} lines
 * @param {boolean[]} ends
 * @param {Array<{ height: number }>} rows
 * @param {number} space
 */
function heightBeforeBreak(headerHeight, lines, ends, rows, space) {
  let used = headerHeight + (lines.length ? 10 : 0);
  if (used > space) return 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const step = line ? BODY.leading + (ends[i] ? BODY.paragraphGap : 0) : BODY.leading * 0.6;
    if (used + (line ? BODY.leading : 0) > space) return used;
    used += step;
  }
  if (rows.length) used += lines.length ? 12 : 4;
  for (const row of rows) {
    if (used + row.height > space) return used;
    used += row.height + PHOTO_GAP;
  }
  return used;
}

/**
 * Photos go one per row at full width, except that two portrait photos in a
 * row sit side by side at a shared height. Very tall photos are capped.
 * @param {PhotoRef[]} photos
 */
function photoRows(photos) {
  /** @type {Array<{ height: number, items: Array<{ photo: PhotoRef, x: number, width: number }> }>} */
  const rows = [];
  for (let i = 0; i < photos.length; i += 1) {
    const a = photos[i];
    const b = photos[i + 1];
    const ratioA = a.height / a.width;
    const ratioB = b ? b.height / b.width : 0;
    if (b && ratioA > 1.1 && ratioB > 1.1) {
      const half = (CONTENT.width - PHOTO_GAP) / 2;
      const height = Math.min(PHOTO_MAX_HEIGHT, half * ratioA, half * ratioB);
      const widthA = height / ratioA;
      const widthB = height / ratioB;
      const left = MARGIN.left + (CONTENT.width - widthA - PHOTO_GAP - widthB) / 2;
      rows.push({
        height,
        items: [
          { photo: a, x: left, width: widthA },
          { photo: b, x: left + widthA + PHOTO_GAP, width: widthB },
        ],
      });
      i += 1;
    } else {
      let width = CONTENT.width;
      let height = width * ratioA;
      if (height > PHOTO_MAX_HEIGHT) {
        height = PHOTO_MAX_HEIGHT;
        width = height / ratioA;
      }
      rows.push({ height, items: [{ photo: a, x: MARGIN.left + (CONTENT.width - width) / 2, width }] });
    }
  }
  return rows;
}

/**
 * A small sealed envelope for the cover, in the document's colours.
 * @param {Page} page @param {number} cx @param {number} top
 */
function drawEnvelope(page, cx, top) {
  const width = 70;
  const height = 46;
  const left = cx - width / 2;
  const right = cx + width / 2;
  const bottom = top + height;
  const r = 4;
  const k = r * 0.45;
  /** @type {Path} */
  const body = [
    ['M', left + r, top],
    ['L', right - r, top],
    ['C', right - k, top, right, top + k, right, top + r],
    ['L', right, bottom - r],
    ['C', right, bottom - k, right - k, bottom, right - r, bottom],
    ['L', left + r, bottom],
    ['C', left + k, bottom, left, bottom - k, left, bottom - r],
    ['L', left, top + r],
    ['C', left, top + k, left + k, top, left + r, top],
    ['Z'],
  ];
  page.ops.push({ kind: 'shape', path: body, fill: COLORS.paper, stroke: COLORS.accent, width: 1 });
  const tip = top + height * 0.56;
  /** @type {Path} */
  const flap = [['M', left + 1.4, top + 1.4], ['L', cx, tip], ['L', right - 1.4, top + 1.4]];
  page.ops.push({ kind: 'shape', path: flap, fill: null, stroke: COLORS.accent, width: 1 });
  page.ops.push({ kind: 'dot', x: cx, y: tip, r: 3.2, color: COLORS.accent });
}
