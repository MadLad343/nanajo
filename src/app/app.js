import { BRAND_TINT, HOME_START_INDEX } from './config.js';
import { createHomeFrame } from './frames/home.js';
import { createModuleFrame } from './frames/module.js';
import { createStore } from './state.js';

/**
 * @typedef {import('./state.js').AppState} AppState
 *
 * @typedef {object} AppDependencies
 * @property {ReturnType<typeof import('./navigation.js').createNavigation>} nav
 * @property {import('./registry.js').Registry} registry
 * @property {import('./storage.js').Storage} storage
 * @property {import('./letters/index.js').Letters} letters
 * @property {ReturnType<typeof import('./errors.js').createErrorBoundary>} errors
 * @property {(options: import('./ui/toast.js').ToastOptions) => void} notify
 * @property {(color: string) => void} setTint
 * @property {boolean} debug
 */

/**
 * Coordinates frames, selection, and module lifecycle. Knows nothing about
 * specific modules; everything it shows comes from the registry.
 * @param {AppDependencies} deps
 */
export function createApp({ nav, registry, storage, letters, errors, notify, setTint, debug }) {
  const { modules } = registry;

  const state = createStore(
    /** @type {AppState} */ ({
      phase: 'initializing',
      frame: 'loading',
      selected: 0,
      activeModule: null,
      storageMode: storage.mode,
    }),
  );

  /** @type {ReturnType<typeof createHomeFrame> | null} */
  let home = null;
  let hasHistoryEntry = false;

  state.subscribe((next, previous) => {
    if (next.selected !== previous.selected) setTint(modules[next.selected]?.tint ?? BRAND_TINT);
  });

  async function start() {
    if (storage.mode === 'memory') {
      console.warn('[nanajo] Using in-memory storage.', storage.error);
      notify({ message: '지금은 저장이 안 돼ㅠㅠ 여기서 쓰는 건 안 남아!', duration: 5000 });
    }

    const selected = Math.max(0, Math.min(HOME_START_INDEX, modules.length - 1));
    home = createHomeFrame({
      modules,
      selected,
      onSelect: (index) => state.update({ selected: index }),
      onOpen: openModule,
    });
    state.update({ phase: 'ready', frame: 'home', selected });
    setTint(modules[selected]?.tint ?? BRAND_TINT);

    window.addEventListener('popstate', onPopState);
    await nav.replace(home);
  }

  // --- Module lifecycle -----------------------------------------------------

  /** @param {number} index */
  async function openModule(index) {
    const module = modules[index];
    if (!module || !home || state.get().activeModule) return;
    const origin = home.selectedRect;

    state.update({ activeModule: module.id, frame: 'module' });
    const frame = createModuleFrame({
      module,
      context: {
        module,
        letters,
        close: closeModule,
        notify: (message) => notify(typeof message === 'string' ? { message } : message),
      },
      getOrigin: origin,
      onBack: closeModule,
      onError: (error) => console.error(`[nanajo] Module "${module.id}" failed.`, error),
      debug,
    });

    // A history entry lets the browser/OS back action close the module.
    try {
      history.pushState({ module: module.id }, '');
      hasHistoryEntry = true;
    } catch {
      hasHistoryEntry = false;
    }

    try {
      await nav.push(frame);
    } catch (error) {
      errors.report(error, `${module.title} 못 열었어ㅠㅠ`);
    }
  }

  function closeModule() {
    if (!state.get().activeModule) return;
    if (hasHistoryEntry) {
      // popstate completes the close; clearing the flag first makes a double tap safe.
      hasHistoryEntry = false;
      history.back();
      return;
    }
    finishClose();
  }

  function onPopState() {
    if (!state.get().activeModule) return;
    hasHistoryEntry = false;
    finishClose();
  }

  async function finishClose() {
    if (!state.get().activeModule) return;
    state.update({ activeModule: null, frame: 'home' });
    try {
      await nav.pop();
    } catch (error) {
      errors.report(error);
    }
  }

  return {
    start,

    /** @param {() => void} apply */
    offerUpdate(apply) {
      notify({ message: '새 버전 나왔어!', action: { label: '새로고침', run: apply }, duration: Infinity });
    },
  };
}
