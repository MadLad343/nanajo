/**
 * Photos are kept once, reduced: a copy sized for reading and for the PDF,
 * plus a small thumbnail for the Archive list. Re-encoding also drops the
 * original file's metadata (such as location), which a letter never needs.
 */

/** Long edge of the kept photo: sharp full-width on an iPhone and at print size in an A5 PDF. */
const PHOTO_EDGE = 1600;
const PHOTO_QUALITY = 0.84;
/** Long edge of the list thumbnail: sharp at the list's largest tile (about 180 pt at 3×). */
const THUMB_EDGE = 560;
const THUMB_QUALITY = 0.78;

/**
 * @typedef {import('./image.js').StoredImage} StoredImage
 *
 * @typedef {object} PreparedPhoto
 * @property {number} width  Pixel size of `photo`.
 * @property {number} height
 * @property {StoredImage} photo
 * @property {StoredImage} thumb
 */

/**
 * Decodes a picked image (upright, using its EXIF orientation), scales it
 * down and re-encodes it as JPEG.
 * @param {Blob} file
 * @returns {Promise<PreparedPhoto>}
 */
export async function preparePhoto(file) {
  const { image, release } = await decode(file);
  try {
    const source = { el: /** @type {CanvasImageSource} */ (image), width: image.naturalWidth, height: image.naturalHeight };
    if (!source.width || !source.height) throw new Error('The image is empty.');
    const photoCanvas = scaleDown(source, PHOTO_EDGE);
    const thumbCanvas = scaleDown({ el: photoCanvas, width: photoCanvas.width, height: photoCanvas.height }, THUMB_EDGE);
    const [photo, thumb] = await Promise.all([encode(photoCanvas, PHOTO_QUALITY), encode(thumbCanvas, THUMB_QUALITY)]);
    const result = { width: photoCanvas.width, height: photoCanvas.height, photo, thumb };
    // Free canvas memory promptly; iOS limits the total across a page.
    photoCanvas.width = photoCanvas.height = thumbCanvas.width = thumbCanvas.height = 0;
    return result;
  } finally {
    release();
  }
}

/**
 * Fits the source within `edge` pixels, halving in steps so large reductions
 * stay smooth.
 * @param {{ el: CanvasImageSource, width: number, height: number }} source
 * @param {number} edge
 */
function scaleDown(source, edge) {
  const scale = Math.min(1, edge / Math.max(source.width, source.height));
  const targetWidth = Math.max(1, Math.round(source.width * scale));
  const targetHeight = Math.max(1, Math.round(source.height * scale));
  let current = source;
  /** @type {HTMLCanvasElement | null} */
  let previous = null;
  do {
    const halve = current.width / 2 > targetWidth;
    const width = halve ? Math.round(current.width / 2) : targetWidth;
    const height = halve ? Math.round(current.height / 2) : targetHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(current.el, 0, 0, width, height);
    if (previous) previous.width = previous.height = 0;
    previous = canvas;
    current = { el: canvas, width, height };
  } while (current.width > targetWidth);
  return /** @type {HTMLCanvasElement} */ (current.el);
}

/**
 * @param {Blob} blob
 * @returns {Promise<{ image: HTMLImageElement, release: () => void }>}
 */
function decode(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    const release = () => URL.revokeObjectURL(url);
    image.onload = () => resolve({ image, release });
    image.onerror = () => {
      release();
      reject(new Error('This image format isn’t supported.'));
    };
    image.src = url;
  });
}

/** @param {HTMLCanvasElement} canvas @param {number} quality @returns {Promise<StoredImage>} */
function encode(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Couldn’t encode the image.'));
        else blob.arrayBuffer().then((bytes) => resolve({ type: 'image/jpeg', bytes }), reject);
      },
      'image/jpeg',
      quality,
    );
  });
}
