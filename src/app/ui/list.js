import { h } from './dom.js';

/**
 * A titled glass group of rows, with an optional footnote.
 * @param {{ title?: string, footer?: string | HTMLElement, className?: string }} options
 * @param {...(Node | null | undefined | false)} rows
 */
export function renderGroup({ title, footer, className }, ...rows) {
  const body = h('div', { class: 'group__body' }, ...rows);
  return h(
    'section',
    { class: className ? `group ${className}` : 'group' },
    title ? h('h2', { class: 'group__title', text: title }) : null,
    body,
    typeof footer === 'string' ? h('p', { class: 'group__footer', text: footer }) : footer,
  );
}

let sequence = 0;

/** A document-unique id, for pairing labels with inputs. @param {string} prefix */
export function uniqueId(prefix) {
  sequence += 1;
  return `${prefix}-${sequence}`;
}
