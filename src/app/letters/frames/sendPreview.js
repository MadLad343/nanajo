import { h, svg } from '../../ui/dom.js';
import { GLYPHS } from '../components/glyphs.js';
import { sharePdf } from '../logic/pdfExport.js';

/**
 * @typedef {object} SendPreviewOptions
 * @property {import('./sendPage.js').LetterToSend} letter
 * @property {import('../logic/entries.js').Journal} journal
 * @property {(message: string) => void} notify
 * @property {(error: unknown, message: string) => void} report
 * @property {() => void} onSent  Returns to the Archive, which now shows the entries as sent.
 */

/**
 * Send, step two: the finished PDF. Its pages can be looked through, then
 * Share PDF opens the share sheet. Only a completed share (or, where sharing
 * files isn't available, the download) marks the entries as sent; cancelling
 * changes nothing.
 * @param {SendPreviewOptions} options
 * @returns {import('../../ui/pageStack.js').Page}
 */
export function createSendPreview({ letter, journal, notify, report, onSent }) {
  const { file, entries, prepared } = letter;
  const count = entries.length === 1 ? '1 entry' : `${entries.length} entries`;
  const pages = prepared.stats.pages;

  const pagesStrip = h('div', { class: 'letter-preview__pages', attrs: { 'aria-label': 'Page preview' } });
  const share = h(
    'button',
    { class: 'button send-preview__share', attrs: { type: 'button' } },
    svg(GLYPHS.share, { class: 'button__icon' }),
    h('span', { text: 'Share PDF' }),
  );
  const el = h(
    'div',
    { class: 'send-preview' },
    pagesStrip,
    h('p', { class: 'letter-preview__info', text: `${pages === 1 ? '1 page' : `${pages} pages`} · ${count} · ${formatSize(file.size)}` }),
    share,
    h('p', {
      class: 'group__footer',
      text: `Opens the share sheet: Mail, Messages, AirDrop, Save to Files… Once you share it, ${entries.length === 1 ? 'the entry is' : `these ${count} are`} marked as sent. Cancel and nothing changes.`,
    }),
  );

  // Page thumbnails, each drawn only when scrolled into view.
  const observer =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(
          (seen) => {
            for (const item of seen) {
              if (!item.isIntersecting) continue;
              const canvas = /** @type {HTMLCanvasElement} */ (item.target);
              observer?.unobserve(canvas);
              prepared.drawPreview(canvas, Number(canvas.dataset.page), canvas.clientWidth || 180).catch(() => {});
            }
          },
          { root: pagesStrip, rootMargin: '0px 400px' },
        )
      : null;
  const canvases = Array.from({ length: pages }, (_, index) => {
    const canvas = h('canvas', { class: 'letter-preview__page', attrs: { 'aria-label': `Page ${index + 1}`, role: 'img' } });
    canvas.dataset.page = String(index);
    return canvas;
  });
  pagesStrip.append(...canvases);
  for (const canvas of canvases) {
    if (observer) observer.observe(canvas);
    else prepared.drawPreview(canvas, Number(canvas.dataset.page), 180).catch(() => {});
  }

  let sharing = false;
  share.addEventListener('click', async () => {
    if (sharing) return;
    sharing = true;
    try {
      // Straight from the tap: the share sheet needs the user's gesture.
      const result = await sharePdf(file);
      if (result === 'cancelled') return;
      try {
        await journal.markSent(entries.map((entry) => entry.id));
      } catch (error) {
        report(error, 'The PDF went out, but the entries couldn’t be marked as sent.');
        return;
      }
      notify(result === 'downloaded' ? `PDF saved to your downloads. ${count} marked as sent.` : `${count} marked as sent.`);
      onSent();
    } catch (error) {
      report(error, 'Couldn’t open the share sheet.');
    } finally {
      sharing = false;
    }
  });

  return { el, title: 'Preview', destroy: () => observer?.disconnect() };
}

/** @param {number} bytes */
function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
