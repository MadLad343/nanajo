import { h } from './dom.js';

/**
 * Ambient background shared by every frame. Tint changes crossfade between two
 * glow layers so only opacity animates (compositor-only, no repaint per frame).
 */
export function createBackdrop() {
  const layers = [h('div', { class: 'backdrop__glow' }), h('div', { class: 'backdrop__glow' })];
  const el = h('div', { class: 'backdrop', attrs: { 'aria-hidden': 'true' } }, ...layers);
  let visible = 0;
  /** @type {string | null} */
  let tint = null;

  return {
    el,
    /** @param {string} color  Any CSS color. */
    setTint(color) {
      if (color === tint) return;
      tint = color;
      const next = layers[1 - visible];
      next.style.setProperty('--glow', color);
      next.classList.add('is-visible');
      layers[visible].classList.remove('is-visible');
      visible = 1 - visible;
    },
  };
}
