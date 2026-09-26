import { h } from './dom.js';

const MAX_DOTS = 12;

/**
 * Page indicator. The active marker moves with a transform transition; past
 * MAX_DOTS it switches to a compact "3 / 20" counter.
 * @param {number} count
 */
export function createPageDots(count) {
  const el = h('div', { class: 'dots', attrs: { 'aria-hidden': 'true' } });
  const compact = count > MAX_DOTS;
  const counter = h('span', { class: 'dots__counter' });
  const marker = h('span', { class: 'dots__active' });

  if (compact) {
    el.append(counter);
  } else {
    for (let i = 0; i < count; i += 1) el.append(h('span', { class: 'dots__dot' }));
    el.append(marker);
  }
  el.hidden = count < 2;

  return {
    el,
    /** @param {number} index */
    set(index) {
      if (compact) counter.textContent = `${index + 1} / ${count}`;
      else marker.style.setProperty('--i', String(index));
    },
  };
}
