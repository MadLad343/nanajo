import { h } from './dom.js';
import { EASE_OUT, animate, prefersReducedMotion } from './motion.js';

/**
 * Text that slides in the direction of navigation when it changes. Outgoing
 * and incoming lines overlap in one grid cell, so rapid changes never reflow.
 * @param {string} className
 * @param {'div' | 'h1'} [tag]
 */
export function createTicker(className, tag = 'div') {
  const el = h(tag, { class: `ticker ${className}`, attrs: { 'aria-live': 'polite' } });
  /** @type {HTMLElement | null} */
  let current = null;

  /**
   * @param {string} text
   * @param {number} [direction]  1 = content moved left (next), -1 = right, 0 = no animation.
   */
  function set(text, direction = 0) {
    if (current?.textContent === text) return;
    const next = h('span', { class: 'ticker__line', text });
    el.append(next);

    const previous = current;
    current = next;
    if (!previous) return;
    previous.setAttribute('aria-hidden', 'true');

    if (direction === 0) {
      previous.remove();
      return;
    }
    const shift = prefersReducedMotion() ? 0 : 22 * direction;
    animate(previous, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-shift}px)` }], {
      duration: 200,
      easing: EASE_OUT,
      fill: 'forwards',
    }).then(() => previous.remove());
    animate(next, [{ opacity: 0, transform: `translateX(${shift}px)` }, { opacity: 1, transform: 'none' }], {
      duration: 320,
      easing: EASE_OUT,
    });
  }

  return { el, set };
}
