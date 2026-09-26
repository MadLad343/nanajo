import { createNavigation } from '../navigation.js';
import { h } from './dom.js';
import { EASE_OUT, animate, play, prefersReducedMotion, settled } from './motion.js';

/**
 * @typedef {object} Page
 * @property {HTMLElement} el  Laid out and scrolled by the stack (`.page`).
 * @property {string} title  Shown in the module bar while this page is on top.
 * @property {string} [backLabel]  Names this page on the back button of pages above it; defaults to `title`.
 * @property {() => void} [destroy]  Runs once, when the page is popped or the stack is destroyed.
 */

/**
 * @typedef {object} PageStackOptions
 * @property {Page} root
 * @property {import('../registry.js').ModuleContext['setHeader']} setHeader
 */

/**
 * Drill-down navigation inside one module (e.g. Archive › an entry › Edit),
 * built on the app's frame stack. Pages keep their state and scroll
 * position while covered. The bar's back button pops; on the root page it
 * keeps its default action, returning Home.
 * @param {PageStackOptions} options
 */
export function createPageStack({ root, setHeader }) {
  const el = h('div', { class: 'pages' });
  const nav = createNavigation(el);
  /** @type {Page[]} */
  const pages = [];
  /** @type {Set<() => void>} */
  const live = new Set();
  let busy = false;
  let destroyed = false;

  /** @param {number} direction */
  function showHeader(direction) {
    const top = pages.at(-1);
    const below = pages.at(-2);
    if (!top) return;
    setHeader({ title: top.title, back: below && { label: below.backLabel ?? below.title, run: pop } }, direction);
  }

  /** @param {Page} page @returns {import('../navigation.js').Frame} */
  function frameFor(page) {
    page.el.classList.add('page');
    let done = false;
    const destroy = () => {
      if (done) return;
      done = true;
      live.delete(destroy);
      page.destroy?.();
    };
    live.add(destroy);

    /** @type {Animation | null} */
    let covering = null;
    return {
      el: page.el,
      enter: (kind) => (kind === 'push' ? animate(page.el, keyframes(AWAY_RIGHT, SHOWN), motion(440)) : undefined),
      leave: (kind) =>
        kind === 'pop' ? animate(page.el, keyframes(SHOWN, AWAY_RIGHT), motion(360, 'forwards')) : undefined,
      cover() {
        covering = play(page.el, keyframes(SHOWN, AWAY_LEFT), motion(440, 'forwards'));
        return settled(covering).then(() => {
          // Covered pages skip painting but keep their DOM, state and scroll position.
          page.el.style.visibility = 'hidden';
          covering?.cancel();
          covering = null;
        });
      },
      uncover() {
        covering?.cancel();
        page.el.style.visibility = '';
        return animate(page.el, keyframes(AWAY_LEFT, SHOWN), motion(360));
      },
      destroy,
    };
  }

  /**
   * Shows `page` on top. Ignored while another push is running, so a double
   * tap can't open a page twice.
   * @param {Page} page
   */
  async function push(page) {
    if (busy || destroyed) {
      page.destroy?.();
      return;
    }
    busy = true;
    pages.push(page);
    showHeader(1);
    try {
      await nav.push(frameFor(page));
    } finally {
      busy = false;
    }
  }

  async function pop() {
    if (pages.length < 2 || destroyed) return;
    pages.pop();
    showHeader(-1);
    await nav.pop();
  }

  /** Back to the first page in one transition, e.g. after finishing a multi-step choice. */
  async function popToRoot() {
    const count = pages.length - 1;
    if (count < 1 || destroyed) return;
    pages.splice(1);
    showHeader(-1);
    await nav.pop(count);
  }

  pages.push(root);
  nav.replace(frameFor(root));
  showHeader(0);

  return {
    el,
    push,
    pop,
    popToRoot,
    get depth() {
      return pages.length;
    },
    destroy() {
      destroyed = true;
      for (const destroyPage of [...live]) destroyPage();
    },
  };
}

const SHOWN = { opacity: 1, transform: 'none' };
const AWAY_RIGHT = { opacity: 0, transform: 'translateX(34%)' };
const AWAY_LEFT = { opacity: 0, transform: 'translateX(-16%) scale(0.98)' };

/** @param {number} duration @param {FillMode} [fill] @returns {KeyframeAnimationOptions} */
function motion(duration, fill) {
  return { duration, easing: EASE_OUT, ...(fill && { fill }) };
}

/** Pushed pages slide in from the right; with reduced motion they only fade. @param {Keyframe} from @param {Keyframe} to */
function keyframes(from, to) {
  if (!prefersReducedMotion()) return [from, to];
  return [{ opacity: from.opacity }, { opacity: to.opacity }];
}
