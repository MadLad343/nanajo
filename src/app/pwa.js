/**
 * @typedef {object} ServiceWorkerOptions
 * @property {boolean} enabled
 * @property {(apply: () => void) => void} onUpdateReady  Offer the user a reload; `apply` activates the new version.
 */

/**
 * Registers the service worker. Updates install in the background and wait
 * until the user applies them, so a running session never mixes old and new
 * files. Never throws: offline support is an enhancement, not a requirement.
 * @param {ServiceWorkerOptions} options
 */
export async function registerServiceWorker({ enabled, onUpdateReady }) {
  // Absent in insecure contexts (plain http on a LAN address) and some embedded browsers.
  if (!('serviceWorker' in navigator)) return;
  const container = navigator.serviceWorker;
  const scope = new URL('./', location.href).href;

  try {
    if (!enabled) {
      const registrations = await container.getRegistrations();
      await Promise.all(registrations.filter((r) => r.scope === scope).map((r) => r.unregister()));
      return;
    }

    let applying = false;
    container.addEventListener('controllerchange', () => {
      if (!applying) return;
      applying = false;
      location.reload();
    });

    /** @param {ServiceWorker} worker */
    const offer = (worker) =>
      onUpdateReady(() => {
        applying = true;
        worker.postMessage({ type: 'SKIP_WAITING' });
      });

    const registration = await container.register('./sw.js', { updateViaCache: 'none' });

    // With no controller this is the first install, not an update.
    if (registration.waiting && container.controller) offer(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && container.controller) offer(worker);
      });
    });

    // Home Screen apps resume far more often than they relaunch; check for updates on resume.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {});
    });
  } catch (error) {
    console.warn('[nanajo] Service worker unavailable; offline support is disabled.', error);
  }
}
