/**
 * @typedef {'replace' | 'push' | 'pop'} TransitionKind
 */

/**
 * A screen managed by the navigation stack. Every hook is optional; a hook that
 * returns a promise holds the transition until it resolves.
 * @typedef {object} Frame
 * @property {HTMLElement} el
 * @property {(kind: TransitionKind) => Promise<void> | void} [enter]  Runs after `el` is attached.
 * @property {(kind: TransitionKind) => Promise<void> | void} [leave]  Runs before `el` is removed.
 * @property {() => Promise<void> | void} [cover]  Another frame is being pushed on top.
 * @property {() => Promise<void> | void} [uncover]  The frame on top is being popped.
 * @property {() => void} [destroy]  Release listeners and resources after removal.
 */

/**
 * Stack of frames inside `root`. Transitions run one at a time, so rapid taps
 * can't interleave them; frames underneath the top one are made inert.
 * @param {HTMLElement} root
 */
export function createNavigation(root) {
  /** @type {Frame[]} */
  const stack = [];
  /** @type {Promise<unknown>} */
  let queue = Promise.resolve();

  /**
   * @param {() => Promise<void>} transition
   * @returns {Promise<void>}
   */
  function enqueue(transition) {
    const run = queue.then(transition);
    queue = run.catch(() => {});
    return run;
  }

  /** @param {Frame} frame */
  function detach(frame) {
    frame.el.remove();
    frame.destroy?.();
  }

  return {
    get depth() {
      return stack.length;
    },

    /**
     * Replaces the whole stack with `frame`. The old frames leave first and the
     * new one enters after, so the two never show on top of each other.
     * @param {Frame} frame
     */
    replace: (frame) =>
      enqueue(async () => {
        const previous = stack.splice(0, stack.length, frame);
        // A failed exit animation must not keep the next frame from showing.
        await Promise.allSettled(previous.map((old) => old.leave?.('replace')));
        previous.forEach(detach);
        root.append(frame.el);
        await frame.enter?.('replace');
      }),

    /** @param {Frame} frame */
    push: (frame) =>
      enqueue(async () => {
        const below = stack.at(-1);
        stack.push(frame);
        if (below) below.el.inert = true;
        root.append(frame.el);
        await Promise.all([frame.enter?.('push'), below?.cover?.()]);
      }),

    /**
     * Removes the top `count` frames (at least one frame always stays). Only
     * the top one animates out; any between it and the new top just go.
     * @param {number} [count]
     */
    pop: (count = 1) =>
      enqueue(async () => {
        const removed = stack.splice(Math.max(stack.length - count, 1));
        const top = removed.pop();
        const below = /** @type {Frame} */ (stack.at(-1));
        if (!top) return;
        removed.forEach(detach);
        top.el.inert = true;
        try {
          await Promise.all([top.leave?.('pop'), below.uncover?.()]);
        } finally {
          detach(top);
          below.el.inert = false;
        }
      }),
  };
}
