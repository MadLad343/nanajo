/**
 * Turns text into positioned pieces for the PDF: runs of glyphs from the
 * embedded font, and "fallback" clusters (emoji, rare scripts) the font
 * doesn't have, which are drawn by the system and embedded as small images.
 * No complex shaping: Latin and Hangul (precomposed syllables) don't need it.
 */

/**
 * @typedef {object} GlyphCluster
 * @property {'glyphs'} kind
 * @property {string} text
 * @property {number[]} glyphs
 * @property {number} width  In points, at the size it was shaped for.
 *
 * @typedef {object} FallbackCluster
 * @property {'fallback'} kind
 * @property {string} text
 * @property {number} width
 *
 * @typedef {GlyphCluster | FallbackCluster} Cluster
 *
 * @typedef {object} Line
 * @property {Cluster[]} clusters  Without trailing spaces.
 * @property {number} width
 */

/** System fonts for characters the embedded font lacks, emoji first. */
export const FALLBACK_FONTS = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", -apple-system, system-ui, sans-serif';
const MEASURE_SIZE = 100;
// Emoji sequences and emoji-style characters always come from the system's emoji font.
const FORCE_FALLBACK = /[\u200d\ufe0f\u20e3]|\p{Emoji_Presentation}/u;

/**
 * @param {import('./font.js').TrueTypeFont} font
 */
export function createShaper(font) {
  const segmenter =
    typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  /** @type {Map<string, number>} Fallback widths at MEASURE_SIZE. */
  const fallbackWidths = new Map();
  /** @type {CanvasRenderingContext2D | null} */
  let measurer = null;

  /** @param {string} text */
  function measureFallback(text) {
    let width = fallbackWidths.get(text);
    if (width === undefined) {
      measurer ??= /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d'));
      measurer.font = `${MEASURE_SIZE}px ${FALLBACK_FONTS}`;
      width = measurer.measureText(text).width;
      fallbackWidths.set(text, width);
    }
    return width;
  }

  /** @param {string} text @returns {string[]} */
  function graphemes(text) {
    if (!segmenter) return Array.from(text);
    return Array.from(segmenter.segment(text), (part) => part.segment);
  }

  /**
   * @param {string} text  One paragraph (no line breaks).
   * @param {number} size  Points.
   * @returns {Cluster[]}
   */
  function shape(text, size) {
    const scale = size / font.unitsPerEm;
    /** @type {Cluster[]} */
    const clusters = [];
    for (const grapheme of graphemes(text.normalize('NFC'))) {
      /** @type {number[]} */
      const glyphs = [];
      let supported = !FORCE_FALLBACK.test(grapheme);
      if (supported) {
        for (const char of grapheme) {
          const glyph = font.glyphId(/** @type {number} */ (char.codePointAt(0)));
          if (!glyph) {
            supported = false;
            break;
          }
          glyphs.push(glyph);
        }
      }
      if (supported) {
        let advance = 0;
        for (const glyph of glyphs) advance += font.advance(glyph);
        clusters.push({ kind: 'glyphs', text: grapheme, glyphs, width: advance * scale });
      } else {
        clusters.push({ kind: 'fallback', text: grapheme, width: (measureFallback(grapheme) * size) / MEASURE_SIZE });
      }
    }
    return clusters;
  }

  /**
   * Breaks a paragraph into lines no wider than `width`, at spaces; a word
   * longer than a line is broken between characters.
   * @param {string} text
   * @param {number} size
   * @param {number} width
   * @returns {Line[]}
   */
  function wrap(text, size, width) {
    const clusters = shape(text.replace(/\t/g, '    ').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ''), size);
    /** @type {Line[]} */
    const lines = [];
    /** @type {Cluster[]} */
    let line = [];
    let lineWidth = 0;

    const flush = () => {
      while (line.length && line[line.length - 1].text === ' ') lineWidth -= /** @type {Cluster} */ (line.pop()).width;
      lines.push({ clusters: line, width: Math.max(0, lineWidth) });
      line = [];
      lineWidth = 0;
    };

    let i = 0;
    while (i < clusters.length) {
      // A word: non-space clusters, then the spaces after them.
      let end = i;
      let wordWidth = 0;
      while (end < clusters.length && clusters[end].text !== ' ') wordWidth += clusters[end++].width;
      let spaceEnd = end;
      let spaceWidth = 0;
      while (spaceEnd < clusters.length && clusters[spaceEnd].text === ' ') spaceWidth += clusters[spaceEnd++].width;

      if (line.length && lineWidth + wordWidth > width) flush();
      if (wordWidth > width) {
        for (let j = i; j < end; j += 1) {
          if (line.length && lineWidth + clusters[j].width > width) flush();
          line.push(clusters[j]);
          lineWidth += clusters[j].width;
        }
      } else {
        for (let j = i; j < end; j += 1) line.push(clusters[j]);
        lineWidth += wordWidth;
      }
      for (let j = end; j < spaceEnd; j += 1) line.push(clusters[j]);
      lineWidth += spaceWidth;
      i = spaceEnd;
    }
    if (line.length || !lines.length) flush();
    return lines;
  }

  /** @param {string} text @param {number} size */
  function measure(text, size) {
    return shape(text, size).reduce((sum, cluster) => sum + cluster.width, 0);
  }

  return { shape, wrap, measure };
}

/** @typedef {ReturnType<typeof createShaper>} Shaper */
