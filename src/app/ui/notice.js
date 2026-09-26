import { h, svg } from './dom.js';
import { ICONS } from './icons.js';

/**
 * @typedef {object} NoticeOptions
 * @property {string} title
 * @property {string} text
 * @property {{ label: string, run: () => void }} action
 * @property {unknown} [details]  Shown as a collapsible diagnostic block when set (debug only).
 */

/**
 * Glass panel for recoverable failures.
 * @param {NoticeOptions} options
 */
export function renderNotice({ title, text, action, details }) {
  const button = h('button', { class: 'button', text: action.label, attrs: { type: 'button' } });
  button.addEventListener('click', action.run);

  return h(
    'div',
    { class: 'panel notice', attrs: { role: 'alert' } },
    svg(ICONS.alert, { class: 'notice__icon' }),
    h('h2', { class: 'notice__title', text: title }),
    h('p', { class: 'notice__text', text }),
    button,
    details !== undefined &&
      h(
        'details',
        { class: 'notice__details' },
        h('summary', { text: '자세히' }),
        h('pre', { text: describeError(details) }),
      ),
  );
}

/** @param {unknown} error */
export function describeError(error) {
  if (error instanceof Error) {
    const stack = error.stack?.includes(error.message) ? error.stack : `${error.name}: ${error.message}\n${error.stack ?? ''}`;
    return stack.trim();
  }
  return String(error);
}
