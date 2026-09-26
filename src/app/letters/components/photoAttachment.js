import { imageBlob } from '../logic/image.js';
import { h } from '../../ui/dom.js';

/**
 * @typedef {import('../logic/storage.js').PhotoRef} PhotoRef
 * @typedef {import('../logic/image.js').StoredImage} StoredImage
 */

/**
 * Loads images only as they approach the visible part of `root` (the page
 * that scrolls), so a long archive never decodes all its photos at once.
 * @param {Element} root
 * @param {string} [rootMargin]
 */
export function createLazyLoader(root, rootMargin = '900px 0px') {
  /** @type {Map<Element, () => void>} */
  const pending = new Map();
  const observer =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              const load = pending.get(entry.target);
              pending.delete(entry.target);
              observer?.unobserve(entry.target);
              load?.();
            }
          },
          { root, rootMargin },
        )
      : null;

  return {
    /** @param {Element} el @param {() => void} load */
    observe(el, load) {
      if (!observer) {
        load();
        return;
      }
      pending.set(el, load);
      observer.observe(el);
    },
    disconnect() {
      observer?.disconnect();
      pending.clear();
    },
  };
}

/** @typedef {ReturnType<typeof createLazyLoader>} LazyLoader */

/**
 * A photo belonging to an entry. Its box keeps the photo's proportions before
 * it loads, so the list doesn't jump while scrolling.
 * @param {object} options
 * @param {PhotoRef} options.photo
 * @param {(id: string) => Promise<StoredImage | null>} options.read  Thumbnail or full photo.
 * @param {LazyLoader} options.loader
 * @param {string} [options.className]
 * @param {string} [options.alt]
 */
export function renderPhoto({ photo, read, loader, className = '', alt = 'Photo' }) {
  const img = h('img', {
    class: 'letter-photo__img',
    attrs: { alt, decoding: 'async', draggable: 'false', width: String(photo.width), height: String(photo.height) },
  });
  const el = h('span', { class: `letter-photo ${className}`.trim(), style: { '--ratio': `${photo.width} / ${photo.height}` } }, img);
  loader.observe(el, async () => {
    const stored = await read(photo.id).catch(() => null);
    if (!stored) {
      el.classList.add('is-missing');
      return;
    }
    const url = URL.createObjectURL(imageBlob(stored));
    img.addEventListener(
      'load',
      () => {
        URL.revokeObjectURL(url);
        el.classList.add('is-loaded');
      },
      { once: true },
    );
    img.addEventListener(
      'error',
      () => {
        URL.revokeObjectURL(url);
        el.classList.add('is-missing');
      },
      { once: true },
    );
    img.src = url;
  });
  return el;
}
