import { imageBlob } from './image.js';
import { canBuildPdf, loadBundledFont } from './pdf/font.js';
import { composeDocument } from './pdf/layout.js';
import { drawPage } from './pdf/preview.js';
import { renderPdf } from './pdf/render.js';
import { FALLBACK_FONTS, createShaper } from './pdf/shaper.js';

/**
 * Turns every entry into one PDF, entirely on the device: nothing is
 * uploaded. The document is composed once (layout only, fast), previewed from
 * that layout, then written with photos loaded one at a time.
 */

export { canBuildPdf };
/** The document font's name for CSS and canvas once registered. */
export const DOCUMENT_FONT = 'Letter Serif';
export const FILE_NAME = 'Letter.pdf';

/** @type {Promise<import('./pdf/font.js').TrueTypeFont> | null} */
let registered = null;

/**
 * Loads the bundled serif and registers it for the page, so letter text on
 * screen and the PDF share one typeface. Safe to call often.
 */
export function useDocumentFont() {
  registered ??= loadBundledFont()
    .then(async (font) => {
      const face = new FontFace(DOCUMENT_FONT, font.buffer.slice(0));
      await face.load();
      document.fonts.add(face);
      return font;
    })
    .catch((error) => {
      registered = null;
      throw error;
    });
  return registered;
}

/**
 * Composes the chosen entries, oldest first, each under its own date.
 * @param {import('./entries.js').Journal} journal
 * @param {readonly import('./storage.js').Entry[]} entries
 */
export async function prepareExport(journal, entries) {
  const font = await useDocumentFont();
  const shaper = createShaper(font);
  const recipient = journal.recipient();
  const oldestFirst = [...entries].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  const doc = composeDocument({ entries: oldestFirst, recipient, shaper });

  /** @type {Map<string, Promise<CanvasImageSource | null>>} */
  const thumbs = new Map();
  /** @param {string} id */
  const loadThumb = (id) => {
    let pending = thumbs.get(id);
    if (!pending) {
      pending = journal.thumbnail(id).then((stored) => (stored ? decodeImage(imageBlob(stored)) : null)).catch(() => null);
      thumbs.set(id, pending);
    }
    return pending;
  };

  return {
    stats: doc.stats,

    /** @param {HTMLCanvasElement} canvas @param {number} index @param {number} width CSS pixels */
    drawPreview: (canvas, index, width) => drawPage(canvas, doc.pages[index], { family: DOCUMENT_FONT, width, loadImage: loadThumb }),

    /**
     * Writes the PDF. Photos are read from storage one by one as their page is written.
     * @param {(fraction: number) => void} [onProgress]
     * @returns {Promise<File>}
     */
    async build(onProgress) {
      const blob = await renderPdf(doc, {
        font,
        title: recipient ? `A letter for ${recipient}` : 'A letter',
        readPhoto: journal.photo,
        rasterize,
        onProgress,
      });
      return new File([blob], FILE_NAME, { type: 'application/pdf' });
    },
  };
}

/** @typedef {Awaited<ReturnType<typeof prepareExport>>} PreparedExport */

/**
 * Hands the PDF to the system share sheet (Save to Files, Mail, AirDrop…),
 * where the user chooses what happens to it. Falls back to a download where
 * sharing files isn't supported. Must be called straight from a tap.
 * @param {File} file
 * @returns {Promise<'shared' | 'cancelled' | 'downloaded'>}
 */
export async function sharePdf(file) {
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      throw error;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}

/**
 * Draws a character the font lacks (usually an emoji) with the system's
 * fonts, as a small JPEG on white to sit inline in the PDF text.
 * @param {string} text
 * @returns {Promise<import('./pdf/render.js').RasterGlyph>}
 */
function rasterize(text) {
  const size = 64;
  const canvas = document.createElement('canvas');
  const context = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  context.font = `${size}px ${FALLBACK_FONTS}`;
  const width = Math.max(1, Math.ceil(context.measureText(text).width));
  const height = Math.round(size * 1.28);
  const baseline = Math.round(size * 1.02);
  canvas.width = width;
  canvas.height = height;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.font = `${size}px ${FALLBACK_FONTS}`;
  context.fillStyle = '#1f2130';
  context.fillText(text, 0, baseline);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Couldn’t draw a character.'));
          return;
        }
        blob.arrayBuffer().then((bytes) => resolve({ bytes: new Uint8Array(bytes), width, height, baseline, size }), reject);
      },
      'image/jpeg',
      0.92,
    );
  });
}

/** @param {Blob} blob @returns {Promise<CanvasImageSource>} */
async function decodeImage(blob) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}
