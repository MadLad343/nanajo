/**
 * @typedef {object} Props
 * @property {string} [class]
 * @property {string} [text]
 * @property {Record<string, string>} [attrs]
 * @property {Record<string, string>} [style]  Set with `style.setProperty`, so custom properties work.
 */

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Props} [props]
 * @param {...(Node | string | null | undefined | false)} children
 * @returns {HTMLElementTagNameMap[K]}
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text != null) el.textContent = props.text;
  for (const [name, value] of Object.entries(props.attrs ?? {})) el.setAttribute(name, value);
  for (const [name, value] of Object.entries(props.style ?? {})) el.style.setProperty(name, value);
  for (const child of children) if (child) el.append(child);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Creates a decorative inline SVG from trusted markup.
 * @param {string} markup
 * @param {{ class?: string, viewBox?: string }} [options]
 */
export function svg(markup, { class: className, viewBox = '0 0 24 24' } = {}) {
  const el = document.createElementNS(SVG_NS, 'svg');
  el.setAttribute('viewBox', viewBox);
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('focusable', 'false');
  if (className) el.setAttribute('class', className);
  el.innerHTML = markup;
  return el;
}
