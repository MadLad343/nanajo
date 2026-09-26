import { APP_NAME } from '../config.js';
import { h } from '../ui/dom.js';
import { EASE_OUT, animate } from '../ui/motion.js';
import { renderNotice } from '../ui/notice.js';

/**
 * Full-screen recovery screen for failures the app can't continue from. It is
 * mounted outside the navigation stack so it works even if navigation broke.
 * @param {{ error: unknown, debug: boolean }} options
 */
export function createErrorFrame({ error, debug }) {
  const notice = renderNotice({
    title: 'Something went wrong',
    text: `${APP_NAME} ran into a problem and couldn’t continue. Reloading usually fixes this.`,
    action: { label: 'Reload', run: () => location.reload() },
    details: debug ? error : undefined,
  });
  const el = h('section', { class: 'frame error', attrs: { 'aria-label': 'Error' } }, notice);

  animate(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: EASE_OUT });
  animate(notice, [{ transform: 'scale(0.94)' }, { transform: 'none' }], { duration: 480, easing: EASE_OUT });
  return { el };
}
