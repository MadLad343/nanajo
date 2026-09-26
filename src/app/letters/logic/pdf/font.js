/**
 * The PDF needs a real font file to embed: web pages can't read the
 * system's fonts. The module ships Gowun Batang (SIL OFL, see
 * assets/fonts/OFL.txt), a serif covering Latin and every Hangul syllable,
 * zlib-compressed. Each export embeds only the glyphs it uses.
 */

const FONT_URL = new URL('../../../../../assets/fonts/gowun-batang.ttf.z', import.meta.url).href;

/** @type {Promise<TrueTypeFont> | null} */
let loading = null;

/** Fetches, inflates and parses the bundled font once per session. @returns {Promise<TrueTypeFont>} */
export function loadBundledFont() {
  loading ??= (async () => {
    const response = await fetch(FONT_URL);
    if (!response.ok || !response.body) throw new Error('The document font is unavailable.');
    const inflated = response.body.pipeThrough(new DecompressionStream('deflate'));
    return parseTrueType(await new Response(inflated).arrayBuffer());
  })().catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

/** Whether this browser can build PDFs (it needs to inflate the font and deflate pages). */
export function canBuildPdf() {
  return typeof DecompressionStream === 'function' && typeof CompressionStream === 'function';
}

/**
 * @typedef {object} TrueTypeFont
 * @property {ArrayBuffer} buffer  The whole font file.
 * @property {string} postscriptName
 * @property {number} unitsPerEm
 * @property {number} ascent  Font units.
 * @property {number} descent  Font units, negative.
 * @property {number} capHeight
 * @property {[number, number, number, number]} bbox
 * @property {(codePoint: number) => number} glyphId  0 when the font lacks the character.
 * @property {(glyph: number) => number} advance  Font units.
 * @property {(glyphs: Iterable<number>) => Uint8Array} subset  A valid font keeping only these glyphs' outlines.
 */

/**
 * Reads the tables needed to lay out text and embed a subset. Supports
 * TrueType outlines ('glyf'), which is what the bundled font uses.
 * @param {ArrayBuffer} buffer
 * @returns {TrueTypeFont}
 */
export function parseTrueType(buffer) {
  const view = new DataView(buffer);
  const version = view.getUint32(0);
  if (version !== 0x00010000 && version !== 0x74727565) throw new Error('Only TrueType fonts are supported.');

  /** @type {Map<string, { offset: number, length: number }>} */
  const tables = new Map();
  const count = view.getUint16(4);
  for (let i = 0; i < count; i += 1) {
    const at = 12 + i * 16;
    const tag = String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));
    tables.set(tag, { offset: view.getUint32(at + 8), length: view.getUint32(at + 12) });
  }
  const table = (/** @type {string} */ tag) => {
    const entry = tables.get(tag);
    if (!entry) throw new Error(`Font is missing its ${tag} table.`);
    return entry;
  };

  const head = table('head').offset;
  const unitsPerEm = view.getUint16(head + 18);
  /** @type {[number, number, number, number]} */
  const bbox = [view.getInt16(head + 36), view.getInt16(head + 38), view.getInt16(head + 40), view.getInt16(head + 42)];
  const longLoca = view.getInt16(head + 50) === 1;

  const hhea = table('hhea').offset;
  const ascent = view.getInt16(hhea + 4);
  const descent = view.getInt16(hhea + 6);
  const metricsCount = view.getUint16(hhea + 34);
  const numGlyphs = view.getUint16(table('maxp').offset + 4);

  const os2 = tables.get('OS/2');
  const capHeight = os2 && os2.length >= 90 ? view.getInt16(os2.offset + 88) : Math.round(ascent * 0.7);

  const hmtx = table('hmtx').offset;
  /** @param {number} glyph */
  const advance = (glyph) => view.getUint16(hmtx + Math.min(glyph, metricsCount - 1) * 4);

  const loca = table('loca').offset;
  /** @param {number} glyph */
  const glyphOffset = (glyph) => (longLoca ? view.getUint32(loca + glyph * 4) : view.getUint16(loca + glyph * 2) * 2);

  return {
    buffer,
    postscriptName: readPostscriptName(view, tables.get('name')) || 'EmbeddedFont',
    unitsPerEm,
    ascent,
    descent,
    capHeight,
    bbox,
    glyphId: readCmap(view, table('cmap').offset),
    advance,
    subset: (glyphs) => subsetFont(buffer, view, tables, { numGlyphs, glyphOffset, glyf: table('glyf').offset }, glyphs),
  };
}

/**
 * Builds a code point → glyph lookup from the best Unicode subtable
 * (format 12 for full Unicode, else format 4).
 * @param {DataView} view
 * @param {number} cmap
 */
function readCmap(view, cmap) {
  const count = view.getUint16(cmap + 2);
  let format4 = -1;
  let format12 = -1;
  for (let i = 0; i < count; i += 1) {
    const platform = view.getUint16(cmap + 4 + i * 8);
    const encoding = view.getUint16(cmap + 6 + i * 8);
    const at = cmap + view.getUint32(cmap + 8 + i * 8);
    const format = view.getUint16(at);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    if (format === 12) format12 = at;
    else if (format === 4) format4 = at;
  }

  /** @type {Map<number, number>} */
  const cache = new Map();

  if (format12 >= 0) {
    const groups = view.getUint32(format12 + 12);
    return (/** @type {number} */ codePoint) => {
      let low = 0;
      let high = groups - 1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        const at = format12 + 16 + mid * 12;
        const start = view.getUint32(at);
        const end = view.getUint32(at + 4);
        if (codePoint < start) high = mid - 1;
        else if (codePoint > end) low = mid + 1;
        else return view.getUint32(at + 8) + codePoint - start;
      }
      return 0;
    };
  }
  if (format4 < 0) throw new Error('Font has no Unicode character map.');

  const segments = view.getUint16(format4 + 6) / 2;
  const ends = format4 + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const rangeOffsets = deltas + segments * 2;
  return (/** @type {number} */ codePoint) => {
    if (codePoint > 0xffff) return 0;
    const cached = cache.get(codePoint);
    if (cached !== undefined) return cached;
    let glyph = 0;
    for (let i = 0; i < segments; i += 1) {
      if (view.getUint16(ends + i * 2) < codePoint) continue;
      const start = view.getUint16(starts + i * 2);
      if (start > codePoint) break;
      const delta = view.getInt16(deltas + i * 2);
      const rangeOffset = view.getUint16(rangeOffsets + i * 2);
      if (rangeOffset === 0) glyph = (codePoint + delta) & 0xffff;
      else {
        const at = rangeOffsets + i * 2 + rangeOffset + (codePoint - start) * 2;
        const raw = view.getUint16(at);
        glyph = raw === 0 ? 0 : (raw + delta) & 0xffff;
      }
      break;
    }
    cache.set(codePoint, glyph);
    return glyph;
  };
}

/** @param {DataView} view @param {{ offset: number, length: number } | undefined} name */
function readPostscriptName(view, name) {
  if (!name) return '';
  const count = view.getUint16(name.offset + 2);
  const strings = name.offset + view.getUint16(name.offset + 4);
  for (let i = 0; i < count; i += 1) {
    const at = name.offset + 6 + i * 12;
    if (view.getUint16(at + 6) !== 6) continue;
    const platform = view.getUint16(at);
    const length = view.getUint16(at + 8);
    const offset = strings + view.getUint16(at + 10);
    let text = '';
    if (platform === 3 || platform === 0) {
      for (let j = 0; j < length; j += 2) text += String.fromCharCode(view.getUint16(offset + j));
    } else {
      for (let j = 0; j < length; j += 1) text += String.fromCharCode(view.getUint8(offset + j));
    }
    const clean = text.replace(/[^\x21-\x7e]/g, '').replace(/[()<>[\]{}/%]/g, '');
    if (clean) return clean;
  }
  return '';
}

/**
 * A copy of the font whose 'glyf' keeps only the listed glyphs (plus the
 * parts of composite glyphs, and .notdef); every other glyph becomes empty.
 * Glyph ids stay unchanged, so text can refer to the original ids.
 * @param {ArrayBuffer} buffer
 * @param {DataView} view
 * @param {Map<string, { offset: number, length: number }>} tables
 * @param {{ numGlyphs: number, glyphOffset: (glyph: number) => number, glyf: number }} glyphs
 * @param {Iterable<number>} wanted
 */
function subsetFont(buffer, view, tables, { numGlyphs, glyphOffset, glyf }, wanted) {
  const keep = new Set([0]);
  /** @param {number} glyph */
  const add = (glyph) => {
    if (glyph >= numGlyphs || keep.has(glyph)) return;
    keep.add(glyph);
    const start = glyphOffset(glyph);
    if (glyphOffset(glyph + 1) - start < 10 || view.getInt16(glyf + start) >= 0) return;
    // Composite glyph: keep its components too.
    let at = glyf + start + 10;
    for (;;) {
      const flags = view.getUint16(at);
      add(view.getUint16(at + 2));
      at += 4 + (flags & 0x0001 ? 4 : 2) + (flags & 0x0008 ? 2 : flags & 0x0040 ? 4 : flags & 0x0080 ? 8 : 0);
      if (!(flags & 0x0020)) break;
    }
  };
  for (const glyph of wanted) add(glyph);

  // New glyf and (long) loca.
  const bytes = new Uint8Array(buffer);
  let size = 0;
  for (const glyph of keep) size += (glyphOffset(glyph + 1) - glyphOffset(glyph) + 3) & ~3;
  const newGlyf = new Uint8Array(size);
  const newLoca = new DataView(new ArrayBuffer((numGlyphs + 1) * 4));
  let position = 0;
  for (let glyph = 0; glyph < numGlyphs; glyph += 1) {
    newLoca.setUint32(glyph * 4, position);
    if (!keep.has(glyph)) continue;
    const start = glyphOffset(glyph);
    const length = glyphOffset(glyph + 1) - start;
    newGlyf.set(bytes.subarray(glyf + start, glyf + start + length), position);
    position += (length + 3) & ~3;
  }
  newLoca.setUint32(numGlyphs * 4, position);

  /** @type {Map<string, Uint8Array>} */
  const out = new Map();
  for (const tag of ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'prep']) {
    const entry = tables.get(tag);
    if (entry) out.set(tag, bytes.slice(entry.offset, entry.offset + entry.length));
  }
  out.set('glyf', newGlyf);
  out.set('loca', new Uint8Array(newLoca.buffer));

  const head = /** @type {Uint8Array} */ (out.get('head'));
  const headView = new DataView(head.buffer);
  headView.setUint32(8, 0); // checkSumAdjustment, set below
  headView.setInt16(50, 1); // long loca
  const post = out.get('post');
  if (post && post.length > 32) {
    // Glyph names are not needed in an embedded font.
    const short = post.slice(0, 32);
    new DataView(short.buffer).setUint32(0, 0x00030000);
    out.set('post', short);
  }

  const file = writeSfnt(out);
  const adjustment = (0xb1b0afba - checksum(file)) >>> 0;
  const headOffset = new DataView(file.buffer).getUint32(12 + [...out.keys()].sort().indexOf('head') * 16 + 8);
  new DataView(file.buffer).setUint32(headOffset + 8, adjustment);
  return file;
}

/** @param {Map<string, Uint8Array>} tables */
function writeSfnt(tables) {
  const tags = [...tables.keys()].sort();
  const count = tags.length;
  let size = 12 + count * 16;
  for (const tag of tags) size += (/** @type {Uint8Array} */ (tables.get(tag)).length + 3) & ~3;
  const file = new Uint8Array(size);
  const view = new DataView(file.buffer);
  const power = 2 ** Math.floor(Math.log2(count));
  view.setUint32(0, 0x00010000);
  view.setUint16(4, count);
  view.setUint16(6, power * 16);
  view.setUint16(8, Math.log2(power));
  view.setUint16(10, count * 16 - power * 16);
  let offset = 12 + count * 16;
  tags.forEach((tag, i) => {
    const data = /** @type {Uint8Array} */ (tables.get(tag));
    const at = 12 + i * 16;
    for (let j = 0; j < 4; j += 1) view.setUint8(at + j, tag.charCodeAt(j));
    view.setUint32(at + 4, checksum(data));
    view.setUint32(at + 8, offset);
    view.setUint32(at + 12, data.length);
    file.set(data, offset);
    offset += (data.length + 3) & ~3;
  });
  return file;
}

/** @param {Uint8Array} data */
function checksum(data) {
  let sum = 0;
  const padded = data.length % 4 ? new Uint8Array((data.length + 3) & ~3) : data;
  if (padded !== data) padded.set(data);
  const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  for (let i = 0; i < padded.length; i += 4) sum = (sum + view.getUint32(i)) >>> 0;
  return sum;
}
