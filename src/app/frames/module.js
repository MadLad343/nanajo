import { BRAND_TINT } from '../config.js';
import { h, svg } from '../ui/dom.js';
import { ICONS } from '../ui/icons.js';
import { EASE_OUT, animate, prefersReducedMotion } from '../ui/motion.js';
import { renderNotice } from '../ui/notice.js';
import { createTicker } from '../ui/ticker.js';

/**
 * @typedef {import('../registry.js').ModuleDefinition} ModuleDefinition
 * @typedef {import('../registry.js').ModuleContext} ModuleContext
 *
 * @typedef {object} ModuleFrameOptions
 * @property {ModuleDefinition} module
 * @property {Omit<ModuleContext, 'setHeader'>} context  The frame adds `setHeader`, since it owns the bar.
 * @property {() => DOMRect} getOrigin  Where the frame grows from and shrinks back to.
 * @property {() => void} onBack
 * @property {(error: unknown) => void} onError
 * @property {boolean} debug
 */

/**
 * Hosts one module: a navigation bar plus a body the module renders into.
 * The module's code starts loading when the frame opens but is mounted only
 * after the opening animation, so its setup work can't stutter the zoom.
 * @param {ModuleFrameOptions} options
 * @returns {import('../navigation.js').Frame}
 */
export function createModuleFrame({ module, context, getOrigin, onBack, onError, debug }) {
  const backLabel = h('span', { class: 'module__back-label', text: 'Home' });
  const back = h(
    'button',
    { class: 'module__back', attrs: { type: 'button', 'aria-label': 'Back to Home' } },
    svg(ICONS.chevronLeft, { class: 'module__back-icon' }),
    backLabel,
  );
  /** @type {{ label: string, run: () => void } | null} */
  let backOverride = null;
  back.addEventListener('click', () => (backOverride ? backOverride.run() : onBack()));

  const title = createTicker('module__title', 'h1');
  const heading = title.el;
  heading.tabIndex = -1;
  title.set(module.title);

  const body = h('main', { class: module.layout === 'full' ? 'module__body module__body--full' : 'module__body' });
  const el = h(
    'section',
    { class: 'frame module', style: { '--tint': module.tint ?? BRAND_TINT }, attrs: { 'aria-label': module.title } },
    h('header', { class: 'module__bar' }, back, heading, h('span')),
    body,
  );

  /** @type {(() => void) | null} */
  let unmount = null;
  let destroyed = false;

  /** @type {ModuleContext['setHeader']} */
  function setHeader(header, direction = 0) {
    if (destroyed) return;
    backOverride = header.back ?? null;
    const label = header.back?.label ?? 'Home';
    if (backLabel.textContent !== label) {
      backLabel.textContent = label;
      back.setAttribute('aria-label', `Back to ${label}`);
      if (direction !== 0) {
        const shift = prefersReducedMotion() ? 0 : 10 * direction;
        animate(backLabel, [{ opacity: 0, transform: `translateX(${shift}px)` }, { opacity: 1, transform: 'none' }], {
          duration: 320,
          easing: EASE_OUT,
        });
      }
    }
    title.set(header.title, direction);
    el.setAttribute('aria-label', header.title || module.title);
    if (direction !== 0) heading.focus({ preventScroll: true });
  }
  const entry = module.load();
  // Handled in mountModule(); this stops an early failure being reported as unhandled.
  entry.catch(() => {});

  async function mountModule() {
    const spinner = h('div', { class: 'spinner module__spinner', attrs: { role: 'status', 'aria-label': 'Loading' } });
    const spinnerTimer = window.setTimeout(() => body.append(spinner), 250);
    try {
      const { mount } = await entry;
      if (destroyed) return;
      const cleanup = await mount(body, { ...context, setHeader });
      if (typeof cleanup === 'function') {
        if (destroyed) cleanup();
        else unmount = cleanup;
      }
      if (!destroyed) animate(body, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: EASE_OUT });
    } catch (error) {
      if (destroyed) return;
      onError(error);
      body.replaceChildren(
        renderNotice({
          title: `${module.title} couldn’t open`,
          text:
            navigator.onLine === false
              ? 'You’re offline, and this screen hasn’t been saved for offline use yet.'
              : 'Something went wrong while opening it.',
          // Browsers cache a failed module import for the page's lifetime, so an
          // in-place retry can't succeed; a reload can.
          action: { label: 'Reload', run: () => location.reload() },
          details: debug ? error : undefined,
        }),
      );
    } finally {
      clearTimeout(spinnerTimer);
      spinner.remove();
    }
  }

  /** Transform that maps this full-screen frame onto the origin rectangle. */
  function originTransform() {
    const from = getOrigin();
    const to = el.getBoundingClientRect();
    if (!from.width || !to.width || prefersReducedMotion()) return 'none';
    const scale = from.width / to.width;
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    return `translate(${dx}px, ${dy}px) scale(${scale})`;
  }

  return {
    el,

    async enter() {
      el.classList.add('is-transitioning');
      await animate(
        el,
        [{ opacity: 0, transform: originTransform() }, { opacity: 1, offset: 0.4 }, { opacity: 1, transform: 'none' }],
        { duration: 480, easing: EASE_OUT },
      );
      el.classList.remove('is-transitioning');
      heading.focus({ preventScroll: true });
      mountModule();
    },

    leave() {
      el.classList.add('is-transitioning');
      return animate(
        el,
        [{ opacity: 1, transform: 'none' }, { opacity: 1, offset: 0.35 }, { opacity: 0, transform: originTransform() }],
        { duration: 400, easing: EASE_OUT, fill: 'forwards' },
      );
    },

    destroy() {
      destroyed = true;
      try {
        unmount?.();
      } catch (error) {
        onError(error);
      }
    },
  };
}
