import { svg } from './dom.js';

let sequence = 0;

/**
 * Renders a module glyph filled with its tint (inherited `--tint`) plus a
 * glossy top highlight. Gradient ids must be unique per document.
 * @param {string} glyph  Inner SVG markup for a 24×24 viewBox.
 * @param {string} [className]
 */
export function renderModuleIcon(glyph, className) {
  const id = `nj-icon-${(sequence += 1)}`;
  return svg(
    `<defs>
      <linearGradient id="${id}-fill" x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0" class="icon-stop-hi"/><stop offset="1" class="icon-stop-lo"/>
      </linearGradient>
      <linearGradient id="${id}-gloss" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.7"/>
        <stop offset="0.52" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <g fill="url(#${id}-fill)">${glyph}</g>
    <g fill="url(#${id}-gloss)">${glyph}</g>`,
    { class: className },
  );
}
