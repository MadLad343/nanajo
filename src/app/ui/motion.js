/** iOS-style deceleration curve, shared by every frame transition. */
export const EASE_OUT = 'cubic-bezier(0.32, 0.72, 0, 1)';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
export const prefersReducedMotion = () => reducedMotion.matches;

/**
 * Starts a Web Animation. Defaults to `fill: 'backwards'` so an element returns
 * to its stylesheet state when the animation ends; pass `fill: 'forwards'` only
 * for elements that are removed or hidden afterwards.
 * @param {Element} el
 * @param {Keyframe[]} keyframes
 * @param {KeyframeAnimationOptions} options
 * @returns {Animation | null} `null` when the animation can't run; callers then jump to the end state.
 */
export function play(el, keyframes, options) {
  if (typeof el.animate !== 'function') return null;
  try {
    return el.animate(keyframes, { fill: 'backwards', ...options });
  } catch (error) {
    // Animation is decoration; a failure here must never break navigation.
    console.warn('[nanajo] Animation skipped.', error);
    return null;
  }
}

/**
 * Resolves when the animation finishes or is cancelled.
 * @param {Animation | null} animation
 * @returns {Promise<void>}
 */
export function settled(animation) {
  return animation ? animation.finished.then(noop, noop) : Promise.resolve();
}

/**
 * @param {Element} el
 * @param {Keyframe[]} keyframes
 * @param {KeyframeAnimationOptions} options
 */
export const animate = (el, keyframes, options) => settled(play(el, keyframes, options));

function noop() {}
