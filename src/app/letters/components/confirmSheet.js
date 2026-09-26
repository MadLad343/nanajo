import { h } from '../../ui/dom.js';
import { uniqueId } from '../../ui/list.js';
import { EASE_OUT, animate, prefersReducedMotion } from '../../ui/motion.js';

/**
 * @typedef {object} ConfirmOptions
 * @property {string} title
 * @property {string} message
 * @property {string} confirm  Label of the confirming (usually destructive) action.
 * @property {string} [cancel]
 * @property {boolean} [destructive]
 */

/**
 * An action sheet asking the user to confirm something that can't be undone.
 * Resolves true only if the confirming button is pressed.
 * @param {HTMLElement} host  Covered by the sheet (the module's own area).
 * @param {ConfirmOptions} options
 * @returns {Promise<boolean>}
 */
export function confirmSheet(host, { title, message, confirm, cancel = '취소', destructive = true }) {
  return new Promise((resolve) => {
    const titleId = uniqueId('sheet-title');
    const messageId = uniqueId('sheet-message');
    const confirmButton = h('button', {
      class: `sheet__button ${destructive ? 'sheet__button--danger' : 'sheet__button--primary'}`,
      text: confirm,
      attrs: { type: 'button' },
    });
    const cancelButton = h('button', { class: 'sheet__button sheet__button--cancel', text: cancel, attrs: { type: 'button' } });
    const panel = h(
      'div',
      {
        class: 'sheet__panel',
        attrs: { role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': titleId, 'aria-describedby': messageId },
      },
      h('h2', { class: 'sheet__title', text: title, attrs: { id: titleId } }),
      h('p', { class: 'sheet__message', text: message, attrs: { id: messageId } }),
      confirmButton,
      cancelButton,
    );
    const scrim = h('div', { class: 'sheet__scrim' });
    const el = h('div', { class: 'sheet' }, scrim, panel);

    const covered = [...host.children].filter((child) => child instanceof HTMLElement && !child.inert);
    covered.forEach((child) => (/** @type {HTMLElement} */ (child).inert = true));
    const previousFocus = /** @type {HTMLElement | null} */ (document.activeElement);
    host.append(el);

    const lift = prefersReducedMotion() ? 'none' : 'translateY(110%)';
    animate(scrim, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: EASE_OUT });
    animate(panel, [{ transform: lift, opacity: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: EASE_OUT });
    cancelButton.focus({ preventScroll: true });

    let done = false;
    /** @param {boolean} result */
    async function close(result) {
      if (done) return;
      done = true;
      el.removeEventListener('keydown', onKey);
      await Promise.all([
        animate(scrim, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: EASE_OUT, fill: 'forwards' }),
        animate(panel, [{ transform: 'none', opacity: 1 }, { transform: lift, opacity: 0 }], { duration: 260, easing: EASE_OUT, fill: 'forwards' }),
      ]);
      el.remove();
      covered.forEach((child) => (/** @type {HTMLElement} */ (child).inert = false));
      previousFocus?.focus?.({ preventScroll: true });
      resolve(result);
    }

    /** @param {KeyboardEvent} event */
    function onKey(event) {
      if (event.key === 'Escape') close(false);
    }
    el.addEventListener('keydown', onKey);
    confirmButton.addEventListener('click', () => close(true));
    cancelButton.addEventListener('click', () => close(false));
    scrim.addEventListener('click', () => close(false));
  });
}
