export const APP_NAME = 'nanajo!';

/** The app icon's blue: the backdrop's glow on the launch screen, and for modules without a tint. */
export const BRAND_TINT = '#8bbbc7';

/**
 * How long the launch logo stays on screen at the least, in ms. Startup work
 * runs meanwhile; Home appears only after the logo has left.
 */
export const SPLASH_HOLD_MS = 2500;

const params = new URLSearchParams(location.search);
const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

/** Shows diagnostic details in error screens. Enabled on localhost or with `?debug`. */
export const DEBUG = isLocalHost || params.has('debug');

/**
 * A cache-first service worker serves stale files while editing locally, so it
 * is off on localhost unless the URL has `?sw`.
 */
export const SERVICE_WORKER_ENABLED = !isLocalHost || params.has('sw');

export const STORAGE = Object.freeze({
  databaseName: 'nanajo',
  openTimeoutMs: 4000,
});

/**
 * Carousel position Home opens on at every launch (clamped to the module list).
 * 1 is New Entry, with Settings one swipe to the left and Archive to the right.
 */
export const HOME_START_INDEX = 1;
