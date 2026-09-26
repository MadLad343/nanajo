import { PAGE } from './layout.js';
import { FALLBACK_FONTS } from './shaper.js';

/**
 * Draws one composed page on a canvas, from the same operations the PDF is
 * written from, so the preview shows the real pagination. Photos use their
 * thumbnails to keep memory low.
 * @param {HTMLCanvasElement} canvas
 * @param {import('./layout.js').Page} page
 * @param {object} options
 * @param {string} options.family  The document font, registered with FontFace.
 * @param {number} options.width  CSS pixels.
 * @param {(id: string) => Promise<CanvasImageSource | null>} options.loadImage
 */
export async function drawPage(canvas, page, { family, width, loadImage }) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const scale = width / PAGE.width;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(PAGE.height * scale * ratio);
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(scale * ratio, 0, 0, scale * ratio, 0, 0);
  context.fillStyle = '#fff';
  context.fillRect(0, 0, PAGE.width, PAGE.height);
  if ('fontKerning' in context) context.fontKerning = 'none';

  for (const op of page.ops) {
    if (op.kind === 'text') {
      context.fillStyle = rgb(op.color);
      let x = op.x;
      for (const cluster of op.clusters) {
        context.font = cluster.kind === 'glyphs' ? `${op.size}px "${family}"` : `${op.size}px ${FALLBACK_FONTS}`;
        context.fillText(cluster.text, x, op.y);
        x += cluster.width + op.tracking * (cluster.kind === 'glyphs' ? cluster.glyphs.length : 1);
      }
    } else if (op.kind === 'rule') {
      context.strokeStyle = rgb(op.color);
      context.lineWidth = op.width;
      context.beginPath();
      context.moveTo(op.x1, op.y1);
      context.lineTo(op.x2, op.y2);
      context.stroke();
    } else if (op.kind === 'dot') {
      context.fillStyle = rgb(op.color);
      context.beginPath();
      context.arc(op.x, op.y, op.r, 0, Math.PI * 2);
      context.fill();
    } else if (op.kind === 'shape') {
      const path = new Path2D();
      for (const segment of op.path) {
        if (segment[0] === 'M') path.moveTo(segment[1], segment[2]);
        else if (segment[0] === 'L') path.lineTo(segment[1], segment[2]);
        else if (segment[0] === 'C') path.bezierCurveTo(segment[1], segment[2], segment[3], segment[4], segment[5], segment[6]);
        else path.closePath();
      }
      if (op.fill) {
        context.fillStyle = rgb(op.fill);
        context.fill(path);
      }
      if (op.stroke) {
        context.strokeStyle = rgb(op.stroke);
        context.lineWidth = op.width;
        context.stroke(path);
      }
    } else if (op.kind === 'photo') {
      const image = await loadImage(op.photo.id);
      context.save();
      context.beginPath();
      if (typeof context.roundRect === 'function') context.roundRect(op.x, op.y, op.width, op.height, op.radius);
      else context.rect(op.x, op.y, op.width, op.height);
      context.clip();
      if (image) context.drawImage(image, op.x, op.y, op.width, op.height);
      else {
        context.fillStyle = '#e6eef0';
        context.fillRect(op.x, op.y, op.width, op.height);
      }
      context.restore();
    }
  }
}

/** @param {[number, number, number]} color */
function rgb([r, g, b]) {
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
}
