/**
 * An encoded image as persisted. Kept as raw bytes rather than a Blob: WebKit
 * has refused Blobs in IndexedDB in some modes (e.g. private browsing), while
 * an ArrayBuffer is plain structured-clone data everywhere.
 * @typedef {object} StoredImage
 * @property {string} type  MIME type.
 * @property {ArrayBuffer} bytes
 */

/** @param {StoredImage} image */
export function imageBlob(image) {
  return new Blob([image.bytes], { type: image.type });
}

/** @param {unknown} value @returns {value is StoredImage} */
export function isStoredImage(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (/** @type {StoredImage} */ (value).type) === 'string' &&
    /** @type {StoredImage} */ (value).bytes instanceof ArrayBuffer
  );
}
