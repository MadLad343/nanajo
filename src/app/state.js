/**
 * @typedef {object} AppState
 * @property {'initializing' | 'ready' | 'failed'} phase
 * @property {'loading' | 'home' | 'module' | 'error'} frame
 * @property {number} selected  Index of the selected module in the registry.
 * @property {string | null} activeModule  Id of the open module, if any.
 * @property {'persistent' | 'memory'} storageMode
 */

/**
 * A minimal observable value. Updates are shallow-merged; subscribers run only
 * when a field actually changes.
 * @template {object} T
 * @param {T} initial
 */
export function createStore(initial) {
  let state = Object.freeze({ ...initial });
  /** @type {Set<(next: T, previous: T) => void>} */
  const listeners = new Set();

  return {
    get: () => state,

    /** @param {Partial<T>} patch */
    update(patch) {
      const previous = state;
      const next = Object.freeze({ ...state, ...patch });
      const changed = /** @type {(keyof T)[]} */ (Object.keys(patch)).some((key) => next[key] !== previous[key]);
      if (!changed) return;
      state = next;
      for (const listener of listeners) listener(next, previous);
    },

    /** @param {(next: T, previous: T) => void} listener */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
