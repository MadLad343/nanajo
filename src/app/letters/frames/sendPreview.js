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
  const count = `이야기 ${entries.length}개`;
  const pages = prepared.stats.pages;

  const pagesStrip = h('div', { class: 'letter-preview__pages', attrs: { 'aria-label': '페이지 미리보기' } });
  const share = h(
    'button',
    { class: 'button send-preview__share', attrs: { type: 'button' } },
    svg(GLYPHS.share, { class: 'button__icon' }),
    h('span', { text: '편지 보내기' }),
  );
  const el = h(
    'div',
    { class: 'send-preview' },
    pagesStrip,
    h('p', { class: 'letter-preview__info', text: `${pages}쪽 · ${count} · ${formatSize(file.size)}` }),
    share,
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
    const canvas = h('canvas', { class: 'letter-preview__page', attrs: { 'aria-label': `${index + 1}쪽`, role: 'img' } });
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
        report(error, '편지는 보냈는데 보낸 표시를 못했어ㅠㅠ');
        return;
      }
      notify(result === 'downloaded' ? `편지를 저장했어! ${count} 보낸 걸로 표시했어.` : `${count} 보냈어!`);
      onSent();
    } catch (error) {
      report(error, '공유 창을 못 열었어ㅠㅠ');
    } finally {
      sharing = false;
    }
  });

  return { el, title: '미리보기', destroy: () => observer?.disconnect() };
}

/** @param {number} bytes */
function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
