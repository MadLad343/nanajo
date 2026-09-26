import { APP_NAME, BRAND_TINT } from '../config.js';
import { createCarousel } from '../ui/carousel.js';
import { h } from '../ui/dom.js';
import { renderModuleIcon } from '../ui/moduleIcon.js';
import { EASE_OUT, animate, play, prefersReducedMotion, settled } from '../ui/motion.js';
import { createPageDots } from '../ui/pageDots.js';
import { createTicker } from '../ui/ticker.js';

/**
 * @typedef {import('../registry.js').ModuleDefinition} ModuleDefinition
 *
 * @typedef {object} HomeFrameOptions
 * @property {readonly ModuleDefinition[]} modules
 * @property {number} selected
 * @property {(index: number) => void} onSelect
 * @property {(index: number) => void} onOpen
 */

/**
 * The module switcher: one module in focus, its neighbours peeking in from the
 * edges, and the selected module's title underneath.
 * @param {HomeFrameOptions} options
 */
export function createHomeFrame({ modules, selected, onSelect, onOpen }) {
  const title = createTicker('home__title');
  const caption = createTicker('home__caption');
  const dots = createPageDots(modules.length);
  const stage = h('div', { class: 'home__stage' });

  const carousel = createCarousel({
    items: modules.map(renderCard),
    index: selected,
    surface: stage,
    onChange: (index, direction) => {
      showLabel(index, direction);
      onSelect(index);
    },
    onActivate: onOpen,
  });

  const label = h('div', { class: 'home__label' }, title.el, caption.el);
  if (modules.length > 0) stage.append(carousel.el, label);
  else stage.append(h('p', { class: 'home__empty', text: '아직 아무것도 없어!' }));

  const header = h('header', { class: 'home__header' }, h('span', { class: 'wordmark', text: APP_NAME }));
  const footer = h('footer', { class: 'home__footer' }, dots.el);
  const el = h('section', { class: 'frame home', attrs: { 'aria-label': '홈' } }, header, stage, footer);

  showLabel(carousel.index, 0);

  /** @param {number} index @param {number} direction */
  function showLabel(index, direction) {
    const module = modules[index];
    title.set(module?.title ?? '', direction);
    caption.set(module?.caption ?? '', direction);
    dots.set(index);
  }

  /** @type {Animation | null} */
  let coverAnimation = null;
  const zoomed = () => (prefersReducedMotion() ? 'none' : 'scale(1.08)');

  return {
    el,
    selectedRect: carousel.selectedRect,

    /** @param {import('../navigation.js').TransitionKind} kind */
    enter(kind) {
      carousel.layout();
      if (kind !== 'replace') return;
      const reduced = prefersReducedMotion();
      const rise = reduced ? 'none' : 'translateY(14px) scale(0.94)';
      const lift = reduced ? 'none' : 'translateY(8px)';
      return Promise.all([
        animate(stage, [{ opacity: 0, transform: rise }, { opacity: 1, transform: 'none' }], {
          duration: 640,
          easing: EASE_OUT,
        }),
        animate(label, [{ opacity: 0, transform: lift }, { opacity: 1, transform: 'none' }], {
          duration: 520,
          delay: 90,
          easing: EASE_OUT,
        }),
        animate(header, [{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: 60, easing: EASE_OUT }),
        animate(footer, [{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: 160, easing: EASE_OUT }),
      ]).then(() => {});
    },

    // Opening a module zooms Home past the viewer, centred on the chosen card.
    cover() {
      const card = carousel.selectedRect();
      const frame = el.getBoundingClientRect();
      el.style.transformOrigin = `${card.left + card.width / 2 - frame.left}px ${card.top + card.height / 2 - frame.top}px`;
      coverAnimation = play(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: zoomed() }], {
        duration: 420,
        easing: EASE_OUT,
        fill: 'forwards',
      });
      return settled(coverAnimation).then(() => {
        // Hidden frames skip painting while a module is open.
        el.style.visibility = 'hidden';
        coverAnimation?.cancel();
        coverAnimation = null;
      });
    },

    uncover() {
      coverAnimation?.cancel();
      el.style.visibility = '';
      return animate(el, [{ opacity: 0, transform: zoomed() }, { opacity: 1, transform: 'none' }], {
        duration: 400,
        easing: EASE_OUT,
      });
    },

    destroy: carousel.destroy,
  };
}

/** @param {ModuleDefinition} module */
function renderCard(module) {
  return h(
    'button',
    {
      class: 'card',
      attrs: { type: 'button', 'aria-label': `${module.title} 여러!!` },
      style: { '--tint': module.tint ?? BRAND_TINT },
    },
    h('span', { class: 'card__sheen' }),
    renderModuleIcon(module.icon, 'card__icon'),
  );
}
