import { createErrorFrame } from './frames/error.js';
import { describeError } from './ui/notice.js';

/**
 * @typedef {object} ErrorBoundaryOptions
 * @property {HTMLElement} root
 * @property {boolean} debug
 * @property {(message: string) => void} notify
 */

/**
 * Application-level error boundary. Before startup completes, any uncaught
 * error is fatal and replaces the UI with a recovery screen (so the app can't
 * hang on the splash). Afterwards, stray errors are logged and surfaced as a
 * notice while the app keeps running.
 * @param {ErrorBoundaryOptions} options
 */
export function createErrorBoundary({ root, debug, notify }) {
  let started = false;
  let fatalShown = false;

  /** @param {unknown} error */
  function fatal(error) {
    console.error('[nanajo] Fatal error', error);
    if (fatalShown) return;
    fatalShown = true;
    try {
      root.append(createErrorFrame({ error, debug }).el);
    } catch (frameError) {
      console.error('[nanajo] Error screen failed', frameError);
      root.textContent = '뭔가 꼬였어ㅠㅠ 새로고침 해바!';
    }
  }

  /**
   * @param {unknown} error
   * @param {string} [context]  Short, user-readable description of what failed.
   */
  function report(error, context = '뭔가 꼬였어ㅠㅠ') {
    console.error(`[nanajo] ${context}`, error);
    notify(debug ? `${context} ${firstLine(describeError(error))}` : context);
  }

  /** @param {unknown} error */
  const handle = (error) => (started ? report(error) : fatal(error));

  window.addEventListener('error', (event) => {
    // Benign browser warning surfaced as an error event; never fatal.
    if (!event.error && /ResizeObserver loop/.test(event.message)) return;
    handle(event.error ?? event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    event.preventDefault();
    handle(event.reason);
  });

  return {
    fatal,
    report,
    markStarted() {
      started = true;
    },
  };
}

/** @param {string} text */
function firstLine(text) {
  return text.split('\n', 1)[0];
}
