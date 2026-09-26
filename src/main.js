import { createApp } from './app/app.js';
import { BRAND_TINT, DEBUG, SERVICE_WORKER_ENABLED, SPLASH_HOLD_MS } from './app/config.js';
import { createErrorBoundary } from './app/errors.js';
import { createLoadingFrame } from './app/frames/loading.js';
import { createLetters } from './app/letters/index.js';
import { modules } from './app/modules/index.js';
import { createNavigation } from './app/navigation.js';
import { registerServiceWorker } from './app/pwa.js';
import { createRegistry } from './app/registry.js';
import { openStorage } from './app/storage.js';
import { createBackdrop } from './app/ui/backdrop.js';
import { createToaster } from './app/ui/toast.js';

async function main() {
  const root = /** @type {HTMLElement} */ (document.getElementById('app'));
  const backdrop = createBackdrop();
  const toaster = createToaster();
  const frames = document.createElement('div');
  frames.className = 'frames';
  root.append(backdrop.el, frames, toaster.el);
  backdrop.setTint(BRAND_TINT);

  const errors = createErrorBoundary({ root, debug: DEBUG, notify: (message) => toaster.show({ message }) });
  const nav = createNavigation(frames);
  nav.replace(createLoadingFrame());
  // The logo stays up at least this long; startup runs in the meantime.
  const splash = new Promise((resolve) => setTimeout(resolve, SPLASH_HOLD_MS));

  try {
    const registry = createRegistry(modules);
    const storage = await openStorage();
    const letters = createLetters(storage.letters);
    const app = createApp({
      nav,
      registry,
      storage,
      letters,
      errors,
      notify: toaster.show,
      setTint: backdrop.setTint,
      debug: DEBUG,
    });
    await splash;
    await app.start();
    errors.markStarted();
    registerServiceWorker({ enabled: SERVICE_WORKER_ENABLED, onUpdateReady: app.offerUpdate });
  } catch (error) {
    errors.fatal(error);
  }
}

main();
