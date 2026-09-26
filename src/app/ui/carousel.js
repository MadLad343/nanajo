import { h } from './dom.js';
import { prefersReducedMotion } from './motion.js';

// Layout, in item widths / item counts.
const SPACING = 0.97; // distance between neighbouring item centres
const NEIGHBOR_SCALE = 0.76;
const NEIGHBOR_OPACITY = 0.62;
const VISIBLE_RANGE = 2.5; // items further than this are hidden

// Gesture recognition.
const SLOP_PX = 10; // movement before a gesture commits to an axis
const AXIS_RATIO = 1.2; // |dx| must exceed |dy| × this to count as horizontal
const COMMIT_DISTANCE = 0.22; // fraction of spacing that commits a slow drag
const FLING_VELOCITY = 0.35; // px/ms that commits a quick flick…
const FLING_MIN_PX = 12; // …provided it travelled at least this far
const VELOCITY_WINDOW_MS = 90;
const MAX_OVERDRAG = 0.35; // rubber-band limit, in items

// Settle spring (position in item units).
const SPRING = { stiffness: 260, damping: 0.88 };
const SPRING_REDUCED = { stiffness: 900, damping: 1 };
const MAX_RELEASE_VELOCITY = 6; // items/s

/**
 * @typedef {object} CarouselOptions
 * @property {HTMLElement[]} items  Focusable elements (usually buttons), all the same size.
 * @property {number} index  Initially selected item.
 * @property {HTMLElement} [surface]  Element that receives swipe gestures; defaults to the carousel.
 * @property {(index: number, direction: number) => void} onChange  Selection committed (±1 direction).
 * @property {(index: number) => void} onActivate  Selected item tapped or activated by keyboard.
 */

/**
 * @typedef {object} Gesture
 * @property {number} pointerId
 * @property {number} startX
 * @property {number} startY
 * @property {number} originX  Pointer x when the horizontal axis locked.
 * @property {number} originPosition  Carousel position when the axis locked.
 * @property {'x' | 'y' | null} axis
 * @property {boolean} caught  The gesture interrupted a running animation.
 * @property {Array<{ x: number, t: number }>} samples
 */

/**
 * Horizontal, one-item-per-swipe carousel. The committed `index` is the source
 * of truth; `position` is only the animated visual state that follows it.
 * @param {CarouselOptions} options
 */
export function createCarousel({ items, index: initialIndex, surface, onChange, onActivate }) {
  const el = h('div', { class: 'carousel', attrs: { role: 'group', 'aria-roledescription': 'carousel' } }, ...items);
  const gestureSurface = surface ?? el;
  const count = items.length;
  const hidden = items.map(() => false);

  let index = clamp(initialIndex, 0, count - 1);
  let position = index;
  let velocity = 0;
  let spacing = 0;
  let frameId = 0;
  let lastTick = 0;
  let suppressClick = false;
  /** @type {Gesture | null} */
  let gesture = null;

  items.forEach((item, i) => {
    item.dataset.index = String(i);
  });
  syncFocusability();

  function layout() {
    const width = items[0]?.offsetWidth ?? 0;
    if (!width) return;
    spacing = width * SPACING;
    render();
  }

  function render() {
    for (let i = 0; i < count; i += 1) {
      const item = items[i];
      const offset = i - position;
      const distance = Math.abs(offset);

      if (distance > VISIBLE_RANGE) {
        if (!hidden[i]) item.style.visibility = 'hidden';
        hidden[i] = true;
        continue;
      }
      if (hidden[i]) item.style.visibility = '';
      hidden[i] = false;

      const near = Math.min(distance, 1);
      const far = Math.max(distance - 1, 0);
      const x = Math.sign(offset) * (near + far * 0.82) * spacing;
      const scale = 1 - near * (1 - NEIGHBOR_SCALE) - far * 0.1;
      const opacity = distance <= 1 ? 1 - near * (1 - NEIGHBOR_OPACITY) : Math.max(0, NEIGHBOR_OPACITY * (2 - distance));

      item.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0) scale(${scale.toFixed(4)})`;
      item.style.opacity = opacity.toFixed(3);
      item.style.setProperty('--focus', (1 - near).toFixed(3));
    }
  }

  // --- Settling -------------------------------------------------------------

  const isAnimating = () => frameId !== 0;

  /** @param {number} initialVelocity  items/s */
  function startSpring(initialVelocity) {
    velocity = clamp(initialVelocity, -MAX_RELEASE_VELOCITY, MAX_RELEASE_VELOCITY);
    if (!frameId) {
      lastTick = performance.now();
      frameId = requestAnimationFrame(tick);
    }
  }

  function stopSpring() {
    cancelAnimationFrame(frameId);
    frameId = 0;
    velocity = 0;
  }

  /** @param {number} now */
  function tick(now) {
    const { stiffness, damping } = prefersReducedMotion() ? SPRING_REDUCED : SPRING;
    const friction = 2 * Math.sqrt(stiffness) * damping;
    let remaining = Math.min((now - lastTick) / 1000, 1 / 20);
    lastTick = now;

    // Fixed sub-steps keep the integration stable when frames are dropped.
    while (remaining > 0) {
      const dt = Math.min(remaining, 1 / 240);
      velocity += (-stiffness * (position - index) - friction * velocity) * dt;
      position += velocity * dt;
      remaining -= dt;
    }

    if (Math.abs(position - index) < 0.0005 && Math.abs(velocity) < 0.01) {
      position = index;
      stopSpring();
    } else {
      frameId = requestAnimationFrame(tick);
    }
    render();
  }

  /**
   * Commits a new selection (at most one step from the current one) and
   * animates towards it.
   * @param {number} next
   * @param {number} [releaseVelocity]
   */
  function select(next, releaseVelocity = 0) {
    const target = clamp(next, 0, count - 1);
    const direction = Math.sign(target - index);
    if (direction !== 0) {
      index = target;
      syncFocusability();
      onChange(index, direction);
    }
    startSpring(releaseVelocity);
  }

  /** @param {number} direction  -1 or 1 */
  function step(direction) {
    const target = clamp(index + direction, 0, count - 1);
    // At either end, a small push that springs back acknowledges the input.
    select(target, target === index ? direction * 2.5 : velocity);
  }

  // --- Gestures ---------------------------------------------------------------

  /** @param {PointerEvent} event */
  function onPointerDown(event) {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0) || count === 0) return;
    const caught = isAnimating();
    if (caught) stopSpring();
    suppressClick = caught;
    gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: event.clientX,
      originPosition: position,
      axis: null,
      caught,
      samples: [],
    };
  }

  /** @param {PointerEvent} event */
  function onPointerMove(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;

    if (!gesture.axis) {
      if (Math.hypot(dx, dy) < SLOP_PX) return;
      gesture.axis = Math.abs(dx) > Math.abs(dy) * AXIS_RATIO ? 'x' : 'y';
      if (gesture.axis === 'y') {
        // Vertical: leave it to native scrolling and let any interrupted settle finish.
        if (gesture.caught) startSpring(0);
        gesture.caught = false;
        return;
      }
      suppressClick = true;
      gesture.originX = event.clientX;
      gesture.originPosition = position;
      try {
        gestureSurface.setPointerCapture(event.pointerId);
      } catch {
        // The pointer may already be gone; the gesture still works without capture.
      }
      el.classList.add('is-dragging');
    }
    if (gesture.axis !== 'x' || !spacing) return;

    const raw = gesture.originPosition - (event.clientX - gesture.originX) / spacing;
    // One swipe may travel at most one item from the committed index.
    position = rubberBand(raw, Math.max(index - 1, 0), Math.min(index + 1, count - 1));

    const now = event.timeStamp;
    gesture.samples.push({ x: event.clientX, t: now });
    while (gesture.samples.length > 2 && now - gesture.samples[0].t > VELOCITY_WINDOW_MS) gesture.samples.shift();
    render();
  }

  /** @param {PointerEvent} event */
  function onPointerUp(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const finished = gesture;
    gesture = null;
    el.classList.remove('is-dragging');

    if (finished.axis !== 'x') {
      if (finished.caught) startSpring(0);
      return;
    }
    if (!spacing) {
      select(index);
      return;
    }

    const moved = event.clientX - finished.originX;
    const pxPerMs = sampleVelocity(finished.samples, event.timeStamp);
    let direction = 0;
    if (event.type !== 'pointercancel') {
      if (Math.abs(pxPerMs) > FLING_VELOCITY && Math.abs(moved) > FLING_MIN_PX) direction = pxPerMs < 0 ? 1 : -1;
      else if (Math.abs(moved) > spacing * COMMIT_DISTANCE) direction = moved < 0 ? 1 : -1;
    }
    select(index + direction, (-pxPerMs * 1000) / spacing);
  }

  /** @param {MouseEvent} event */
  function onClick(event) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const target = /** @type {Element} */ (event.target).closest('[data-index]');
    if (!target || !el.contains(target)) return;
    const tapped = Number(/** @type {HTMLElement} */ (target).dataset.index);
    if (tapped === index) onActivate(index);
    else step(Math.sign(tapped - index));
  }

  /** @param {KeyboardEvent} event */
  function onKeyDown(event) {
    const direction = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!direction) return;
    event.preventDefault();
    step(direction);
    items[index]?.focus({ preventScroll: true });
  }

  function syncFocusability() {
    items.forEach((item, i) => {
      item.tabIndex = i === index ? 0 : -1;
      if (i === index) item.setAttribute('aria-current', 'true');
      else item.removeAttribute('aria-current');
    });
  }

  /** @param {Event} event */
  const preventDefault = (event) => event.preventDefault();

  gestureSurface.addEventListener('pointerdown', onPointerDown);
  gestureSurface.addEventListener('pointermove', onPointerMove);
  gestureSurface.addEventListener('pointerup', onPointerUp);
  gestureSurface.addEventListener('pointercancel', onPointerUp);
  gestureSurface.addEventListener('dragstart', preventDefault);
  el.addEventListener('click', onClick);
  el.addEventListener('keydown', onKeyDown);

  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(layout) : null;
  resizeObserver?.observe(el);
  if (!resizeObserver) window.addEventListener('resize', layout);

  return {
    el,
    get index() {
      return index;
    },
    layout,
    step,
    /** Screen rectangle of the selected item, for transitions that grow out of it. */
    selectedRect: () => items[index]?.getBoundingClientRect() ?? el.getBoundingClientRect(),
    destroy() {
      stopSpring();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', layout);
      gestureSurface.removeEventListener('pointerdown', onPointerDown);
      gestureSurface.removeEventListener('pointermove', onPointerMove);
      gestureSurface.removeEventListener('pointerup', onPointerUp);
      gestureSurface.removeEventListener('pointercancel', onPointerUp);
      gestureSurface.removeEventListener('dragstart', preventDefault);
    },
  };
}

/**
 * Pointer velocity in px/ms over the recent samples; zero if the pointer
 * paused before release, so a slow, deliberate release is never a fling.
 * @param {Array<{ x: number, t: number }>} samples
 * @param {number} releasedAt
 */
function sampleVelocity(samples, releasedAt) {
  if (samples.length < 2) return 0;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const dt = last.t - first.t;
  if (dt <= 0 || releasedAt - last.t > VELOCITY_WINDOW_MS) return 0;
  return (last.x - first.x) / dt;
}

/**
 * iOS-style resistance past [min, max].
 * @param {number} value @param {number} min @param {number} max
 */
function rubberBand(value, min, max) {
  if (value < min) return min - resist(min - value);
  if (value > max) return max + resist(value - max);
  return value;
}

/** @param {number} overshoot */
function resist(overshoot) {
  return MAX_OVERDRAG * (1 - 1 / ((overshoot * 0.55) / MAX_OVERDRAG + 1));
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
