import { h } from './dom.js';
import { EASE_OUT, animate } from './motion.js';

/**
 * @typedef {object} ToastOptions
 * @property {string} message
 * @property {{ label: string, run: () => void }} [action]
 * @property {number} [duration]  Milliseconds before auto-dismiss; `Infinity` keeps it until acted on.
 */

/** Single-slot, non-blocking notices shown under the status bar. */
export function createToaster() {
  const el = h('div', { class: 'toasts', attrs: { role: 'status', 'aria-live': 'polite' } });
  /** @type {(() => void) | null} */
  let dismissCurrent = null;

  /** @param {ToastOptions} options @returns {() => void} Dismisses this toast. */
  function show({ message, action, duration = 3200 }) {
    dismissCurrent?.();

    const toast = h('div', { class: 'toast' }, h('span', { class: 'toast__text', text: message }));
    let timer = 0;
    let dismissed = false;

    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      clearTimeout(timer);
      if (dismissCurrent === dismiss) dismissCurrent = null;
      toast.setAttribute('aria-hidden', 'true');
      animate(toast, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(-12px) scale(0.96)' }], {
        duration: 220,
        easing: EASE_OUT,
        fill: 'forwards',
      }).then(() => toast.remove());
    };

    if (action) {
      const button = h('button', { class: 'toast__action', text: action.label, attrs: { type: 'button' } });
      button.addEventListener('click', () => {
        dismiss();
        action.run();
      });
      toast.append(button);
      toast.classList.add('has-action');
    }

    el.append(toast);
    animate(toast, [{ opacity: 0, transform: 'translateY(-16px) scale(0.94)' }, { opacity: 1, transform: 'none' }], {
      duration: 420,
      easing: EASE_OUT,
    });
    if (Number.isFinite(duration)) timer = window.setTimeout(dismiss, duration);
    dismissCurrent = dismiss;
    return dismiss;
  }

  return { el, show };
}
