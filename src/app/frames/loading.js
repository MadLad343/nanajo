import { APP_NAME } from '../config.js';
import { h } from '../ui/dom.js';
import { EASE_OUT, animate, prefersReducedMotion } from '../ui/motion.js';

/**
 * The launch screen: the app's artwork, shown while the app initialises and
 * for at least `SPLASH_HOLD_MS` (see main.js). It leaves completely before
 * Home enters. The spinner only fades in if startup runs well past that
 * (see `.loading__spinner` in app.css).
 * @returns {import('../navigation.js').Frame}
 */
export function createLoadingFrame() {
  const brand = h(
    'div',
    { class: 'loading__brand' },
    // The artwork carries the app's name, so it is the image's text alternative.
    h('img', {
      class: 'loading__logo',
      attrs: { src: 'assets/brand/logo.jpg', alt: APP_NAME, width: '208', height: '208', decoding: 'async' },
    }),
  );
  const spinner = h('div', { class: 'spinner loading__spinner' });
  const el = h(
    'section',
    { class: 'frame loading', attrs: { role: 'status', 'aria-label': `${APP_NAME} 기다려!` } },
    brand,
    spinner,
  );

  return {
    el,
    leave: () => {
      spinner.hidden = true;
      const scale = prefersReducedMotion() ? 'none' : 'scale(1.06)';
      return animate(brand, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: scale }], {
        duration: 420,
        easing: EASE_OUT,
        fill: 'forwards',
      });
    },
  };
}
