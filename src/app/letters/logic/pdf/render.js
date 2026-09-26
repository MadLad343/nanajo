import { PAGE } from './layout.js';
import { createPdfWriter, deflate, num, pdfDate, textString } from './writer.js';

/**
 * Writes a composed document as a PDF: real text in the embedded (subset)
 * font, photos embedded as the JPEGs they are stored as, and small images
 * for the few characters the font can't draw (such as emoji).
 *
 * @typedef {import('./layout.js').Op} Op
 * @typedef {import('./layout.js').Color} Color
 *
 * @typedef {object} RasterGlyph  A fallback character drawn by the system.
 * @property {Uint8Array} bytes  JPEG on white.
 * @property {number} width  Pixels.
 * @property {number} height
 * @property {number} baseline  Pixels from the top.
 * @property {number} size  Font size it was drawn at, in pixels.
 *
 * @typedef {object} RenderOptions
 * @property {import('./font.js').TrueTypeFont} font
 * @property {(id: string) => Promise<import('../image.js').StoredImage | null>} readPhoto
 * @property {(text: string) => Promise<RasterGlyph>} rasterize
 * @property {string} title
 * @property {(fraction: number) => void} [onProgress]
 */

const encoder = new TextEncoder();

/**
 * @param {import('./layout.js').ComposedDocument} doc
 * @param {RenderOptions} options
 * @returns {Promise<Blob>}
 */
export async function renderPdf(doc, { font, readPhoto, rasterize, title, onProgress }) {
  const pdf = createPdfWriter();
  const catalog = pdf.reserve();
  const pagesRoot = pdf.reserve();
  const fontRef = pdf.reserve();
  const info = pdf.reserve();

  // Which glyphs are used (and what text they stand for), and which
  // characters need drawing as images.
  /** @type {Map<number, string>} */
  const unicode = new Map();
  /** @type {Map<string, { name: string, ref: number, glyph: RasterGlyph } | null>} */
  const fallbacks = new Map();
  for (const page of doc.pages) {
    for (const op of page.ops) {
      if (op.kind !== 'text') continue;
      for (const cluster of op.clusters) {
        if (cluster.kind === 'fallback') fallbacks.set(cluster.text, null);
        else if (cluster.glyphs.length === 1) unicode.set(cluster.glyphs[0], cluster.text);
        else [...cluster.text].forEach((char, i) => cluster.glyphs[i] !== undefined && unicode.set(cluster.glyphs[i], char));
      }
    }
  }

  let fallbackCount = 0;
  for (const text of fallbacks.keys()) {
    const glyph = await rasterize(text);
    const ref = pdf.reserve();
    pdf.stream(ref, imageDictionary(glyph.width, glyph.height, 3), glyph.bytes);
    fallbacks.set(text, { name: `G${(fallbackCount += 1)}`, ref, glyph });
  }

  /** @type {Map<string, { name: string, ref: number } | null>} Photos written so far, by id. */
  const photos = new Map();
  /** @type {number[]} */
  const pageRefs = [];

  for (const [index, page] of doc.pages.entries()) {
    /** @type {Map<string, number>} */
    const xobjects = new Map();
    let content = '';
    for (const op of page.ops) {
      if (op.kind === 'text') content += drawText(op, fallbacks, xobjects);
      else if (op.kind === 'rule') content += `q ${color(op.color, 'RG')} ${num(op.width)} w ${num(op.x1)} ${num(PAGE.height - op.y1)} m ${num(op.x2)} ${num(PAGE.height - op.y2)} l S Q\n`;
      else if (op.kind === 'dot') content += `q ${color(op.color, 'rg')} ${circle(op.x, PAGE.height - op.y, op.r)} f Q\n`;
      else if (op.kind === 'shape') content += drawShape(op);
      else if (op.kind === 'photo') {
        let image = photos.get(op.photo.id);
        if (image === undefined) {
          image = await embedPhoto(pdf, op.photo.id, readPhoto, photos.size + 1);
          photos.set(op.photo.id, image);
        }
        if (!image) continue;
        xobjects.set(image.name, image.ref);
        const bottom = PAGE.height - op.y - op.height;
        content +=
          `q ${roundedRect(op.x, bottom, op.width, op.height, op.radius)} W n ` +
          `${num(op.width)} 0 0 ${num(op.height)} ${num(op.x)} ${num(bottom)} cm /${image.name} Do Q\n`;
      }
    }

    const contentRef = pdf.reserve();
    pdf.stream(contentRef, '/Filter /FlateDecode', await deflate(encoder.encode(content)));
    const pageRef = pdf.reserve();
    const xobjectEntries = [...xobjects].map(([name, ref]) => `/${name} ${ref} 0 R`).join(' ');
    pdf.object(
      pageRef,
      `<< /Type /Page /Parent ${pagesRoot} 0 R /MediaBox [0 0 ${num(PAGE.width)} ${num(PAGE.height)}] ` +
        `/Resources << /Font << /F1 ${fontRef} 0 R >>${xobjectEntries ? ` /XObject << ${xobjectEntries} >>` : ''} >> ` +
        `/Contents ${contentRef} 0 R >>`,
    );
    pageRefs.push(pageRef);
    onProgress?.(((index + 1) / doc.pages.length) * 0.9);
  }

  await writeFont(pdf, fontRef, font, unicode);
  onProgress?.(0.97);

  pdf.object(pagesRoot, `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`);
  pdf.object(catalog, `<< /Type /Catalog /Pages ${pagesRoot} 0 R /ViewerPreferences << /DisplayDocTitle true >> >>`);
  pdf.object(
    info,
    `<< /Title ${textString(title)} /Creator ${textString('nanajo!')} /Producer ${textString('nanajo!')} /CreationDate (${pdfDate(new Date())}) >>`,
  );
  onProgress?.(1);
  return pdf.finish(catalog, info);
}

/**
 * @param {import('./layout.js').TextOp} op
 * @param {Map<string, { name: string, ref: number, glyph: RasterGlyph } | null>} fallbacks
 * @param {Map<string, number>} xobjects
 */
function drawText(op, fallbacks, xobjects) {
  const baseline = PAGE.height - op.y;
  let out = '';
  let x = op.x;
  let runX = x;
  let run = '';
  const flush = () => {
    if (run) {
      out += `BT /F1 ${num(op.size)} Tf ${num(op.tracking)} Tc ${color(op.color, 'rg')} 1 0 0 1 ${num(runX)} ${num(baseline)} Tm <${run}> Tj ET\n`;
    }
    run = '';
  };
  for (const cluster of op.clusters) {
    if (cluster.kind === 'glyphs') {
      if (!run) runX = x;
      for (const glyph of cluster.glyphs) run += glyph.toString(16).padStart(4, '0');
      x += cluster.width + op.tracking * cluster.glyphs.length;
      continue;
    }
    flush();
    const image = fallbacks.get(cluster.text);
    if (image) {
      const scale = op.size / image.glyph.size;
      const width = image.glyph.width * scale;
      const height = image.glyph.height * scale;
      const bottom = baseline - (image.glyph.height - image.glyph.baseline) * scale;
      xobjects.set(image.name, image.ref);
      out += `q ${num(width)} 0 0 ${num(height)} ${num(x)} ${num(bottom)} cm /${image.name} Do Q\n`;
    }
    x += cluster.width + op.tracking;
  }
  flush();
  return out;
}

/** @param {import('./layout.js').ShapeOp} op */
function drawShape(op) {
  let path = '';
  for (const segment of op.path) {
    if (segment[0] === 'Z') path += 'h ';
    else if (segment[0] === 'C') {
      const [, x1, y1, x2, y2, x, y] = segment;
      path += `${num(x1)} ${num(PAGE.height - y1)} ${num(x2)} ${num(PAGE.height - y2)} ${num(x)} ${num(PAGE.height - y)} c `;
    } else {
      path += `${num(segment[1])} ${num(PAGE.height - segment[2])} ${segment[0] === 'M' ? 'm' : 'l'} `;
    }
  }
  const paint = op.fill && op.stroke ? 'B' : op.fill ? 'f' : 'S';
  const fill = op.fill ? `${color(op.fill, 'rg')} ` : '';
  const stroke = op.stroke ? `${color(op.stroke, 'RG')} ${num(op.width)} w 1 j ` : '';
  return `q ${fill}${stroke}${path}${paint} Q\n`;
}

/**
 * Embeds one stored photo as-is (its JPEG bytes become the image stream).
 * @param {import('./writer.js').PdfWriter} pdf
 * @param {string} id
 * @param {RenderOptions['readPhoto']} readPhoto
 * @param {number} index
 */
async function embedPhoto(pdf, id, readPhoto, index) {
  const stored = await readPhoto(id);
  if (!stored) return null;
  const bytes = new Uint8Array(stored.bytes);
  const info = jpegInfo(bytes);
  if (!info) return null;
  const ref = pdf.reserve();
  pdf.stream(ref, imageDictionary(info.width, info.height, info.components), bytes);
  return { name: `P${index}`, ref };
}

/** @param {number} width @param {number} height @param {number} components */
function imageDictionary(width, height, components) {
  const space = components === 1 ? '/DeviceGray' : components === 4 ? '/DeviceCMYK /Decode [1 0 1 0 1 0 1 0]' : '/DeviceRGB';
  return `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace ${space} /BitsPerComponent 8 /Filter /DCTDecode`;
}

/** Pixel size and channel count from a JPEG's frame header. @param {Uint8Array} bytes */
export function jpegInfo(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2;
      continue;
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8], components: bytes[i + 9] };
    }
    i += 2 + length;
  }
  return null;
}

/**
 * The font as a Type 0 (CID) font using the original glyph ids, with widths
 * for the glyphs used and a ToUnicode map so the text can be copied and searched.
 * @param {import('./writer.js').PdfWriter} pdf
 * @param {number} ref
 * @param {import('./font.js').TrueTypeFont} font
 * @param {Map<number, string>} unicode
 */
async function writeFont(pdf, ref, font, unicode) {
  const glyphs = [...unicode.keys()].sort((a, b) => a - b);
  const subset = font.subset(glyphs);
  const scale = 1000 / font.unitsPerEm;
  const name = `${subsetTag(glyphs)}+${font.postscriptName}`;

  const fileRef = pdf.reserve();
  pdf.stream(fileRef, `/Length1 ${subset.byteLength} /Filter /FlateDecode`, await deflate(subset));

  const descriptorRef = pdf.reserve();
  const bbox = font.bbox.map((value) => Math.round(value * scale)).join(' ');
  pdf.object(
    descriptorRef,
    `<< /Type /FontDescriptor /FontName /${name} /Flags 6 /FontBBox [${bbox}] /ItalicAngle 0 ` +
      `/Ascent ${Math.round(font.ascent * scale)} /Descent ${Math.round(font.descent * scale)} ` +
      `/CapHeight ${Math.round(font.capHeight * scale)} /StemV 80 /FontFile2 ${fileRef} 0 R >>`,
  );

  const widths = glyphs.map((glyph) => `${glyph} [${Math.round(font.advance(glyph) * scale)}]`).join(' ');
  const cidRef = pdf.reserve();
  pdf.object(
    cidRef,
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${name} ` +
      `/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> ` +
      `/FontDescriptor ${descriptorRef} 0 R /DW 1000 /W [${widths}] /CIDToGIDMap /Identity >>`,
  );

  const toUnicodeRef = pdf.reserve();
  pdf.stream(toUnicodeRef, '/Filter /FlateDecode', await deflate(encoder.encode(toUnicodeCMap(glyphs, unicode))));

  pdf.object(
    ref,
    `<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H ` +
      `/DescendantFonts [${cidRef} 0 R] /ToUnicode ${toUnicodeRef} 0 R >>`,
  );
}

/** @param {number[]} glyphs @param {Map<number, string>} unicode */
function toUnicodeCMap(glyphs, unicode) {
  let body = '';
  for (let i = 0; i < glyphs.length; i += 100) {
    const chunk = glyphs.slice(i, i + 100);
    body += `${chunk.length} beginbfchar\n`;
    for (const glyph of chunk) {
      const text = unicode.get(glyph) ?? '';
      let hex = '';
      for (let j = 0; j < text.length; j += 1) hex += text.charCodeAt(j).toString(16).padStart(4, '0');
      body += `<${glyph.toString(16).padStart(4, '0')}> <${hex || 'fffd'}>\n`;
    }
    body += 'endbfchar\n';
  }
  return (
    '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n' +
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n' +
    '/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n' +
    '1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n' +
    body +
    'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n'
  );
}

/** Six capital letters marking an embedded subset, derived from its glyphs. @param {number[]} glyphs */
function subsetTag(glyphs) {
  let hash = 2166136261;
  for (const glyph of glyphs) hash = Math.imul(hash ^ glyph, 16777619) >>> 0;
  let tag = '';
  for (let i = 0; i < 6; i += 1) {
    tag += String.fromCharCode(65 + (hash % 26));
    hash = Math.floor(hash / 26) + i * 7919;
  }
  return tag;
}

/** @param {Color} value @param {'rg' | 'RG'} operator */
function color(value, operator) {
  return `${num(value[0])} ${num(value[1])} ${num(value[2])} ${operator}`;
}

/** @param {number} x @param {number} y @param {number} r */
function circle(x, y, r) {
  const k = r * 0.5523;
  return (
    `${num(x + r)} ${num(y)} m ` +
    `${num(x + r)} ${num(y + k)} ${num(x + k)} ${num(y + r)} ${num(x)} ${num(y + r)} c ` +
    `${num(x - k)} ${num(y + r)} ${num(x - r)} ${num(y + k)} ${num(x - r)} ${num(y)} c ` +
    `${num(x - r)} ${num(y - k)} ${num(x - k)} ${num(y - r)} ${num(x)} ${num(y - r)} c ` +
    `${num(x + k)} ${num(y - r)} ${num(x + r)} ${num(y - k)} ${num(x + r)} ${num(y)} c`
  );
}

/** Path of a rectangle with rounded corners; (x, y) is the bottom-left in PDF space. @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r */
function roundedRect(x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  const k = radius * 0.5523;
  const right = x + w;
  const top = y + h;
  return (
    `${num(x + radius)} ${num(y)} m ${num(right - radius)} ${num(y)} l ` +
    `${num(right - radius + k)} ${num(y)} ${num(right)} ${num(y + radius - k)} ${num(right)} ${num(y + radius)} c ` +
    `${num(right)} ${num(top - radius)} l ` +
    `${num(right)} ${num(top - radius + k)} ${num(right - radius + k)} ${num(top)} ${num(right - radius)} ${num(top)} c ` +
    `${num(x + radius)} ${num(top)} l ` +
    `${num(x + radius - k)} ${num(top)} ${num(x)} ${num(top - radius + k)} ${num(x)} ${num(top - radius)} c ` +
    `${num(x)} ${num(y + radius)} l ` +
    `${num(x)} ${num(y + radius - k)} ${num(x + radius - k)} ${num(y)} ${num(x + radius)} ${num(y)} c h`
  );
}
