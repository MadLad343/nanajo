/**
 * Minimal PDF 1.7 file writer: numbered objects, streams and the
 * cross-reference table. The file is kept as a list of chunks (images stay
 * as the bytes they were stored as) and joined into a Blob at the end.
 */

const encoder = new TextEncoder();

export function createPdfWriter() {
  /** @type {BlobPart[]} */
  const parts = [];
  /** @type {number[]} Byte offset of each object, by object number. */
  const offsets = [];
  let offset = 0;
  let next = 1;

  /** @param {Uint8Array | string} chunk */
  function push(chunk) {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
    parts.push(/** @type {BlobPart} */ (bytes));
    offset += bytes.byteLength;
  }

  // Header; the binary comment tells tools the file holds binary data.
  push('%PDF-1.7\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  return {
    /** Reserves an object number, so objects can refer to ones written later. */
    reserve: () => next++,

    /** @param {number} number @param {string} body */
    object(number, body) {
      offsets[number] = offset;
      push(`${number} 0 obj\n${body}\nendobj\n`);
    },

    /**
     * @param {number} number
     * @param {string} dictionary  Entries other than /Length.
     * @param {Uint8Array} data
     */
    stream(number, dictionary, data) {
      offsets[number] = offset;
      push(`${number} 0 obj\n<< ${dictionary} /Length ${data.byteLength} >>\nstream\n`);
      push(data);
      push('\nendstream\nendobj\n');
    },

    /** @param {number} root @param {number} info @returns {Blob} */
    finish(root, info) {
      const start = offset;
      let table = `xref\n0 ${next}\n0000000000 65535 f \n`;
      for (let i = 1; i < next; i += 1) {
        table += `${String(offsets[i] ?? 0).padStart(10, '0')} 00000 ${offsets[i] === undefined ? 'f' : 'n'} \n`;
      }
      push(table);
      push(`trailer\n<< /Size ${next} /Root ${root} 0 R /Info ${info} 0 R >>\nstartxref\n${start}\n%%EOF\n`);
      return new Blob(parts, { type: 'application/pdf' });
    },
  };
}

/** @typedef {ReturnType<typeof createPdfWriter>} PdfWriter */

/** zlib-compresses bytes for a /FlateDecode stream. @param {Uint8Array} bytes */
export async function deflate(bytes) {
  const stream = new Blob([/** @type {BlobPart} */ (bytes)]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A PDF text string, UTF-16 with a byte-order mark, so any language survives. @param {string} value */
export function textString(value) {
  let hex = 'FEFF';
  for (let i = 0; i < value.length; i += 1) hex += value.charCodeAt(i).toString(16).padStart(4, '0');
  return `<${hex}>`;
}

/** Compact number formatting for content streams. @param {number} value */
export function num(value) {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/** @param {Date} date */
export function pdfDate(date) {
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}
