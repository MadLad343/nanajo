const STROKE = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';

/** Interface glyphs for the letter screens (24×24). */
export const GLYPHS = Object.freeze({
  share:
    `<path d="M12 14.5v-11M8 7.2l4-3.7 4 3.7" ${STROKE} stroke-width="2"/>` +
    `<path d="M8.5 10.5H7.2A2.2 2.2 0 0 0 5 12.7v5.6a2.2 2.2 0 0 0 2.2 2.2h9.6a2.2 2.2 0 0 0 2.2-2.2v-5.6a2.2 2.2 0 0 0-2.2-2.2h-1.3" ${STROKE} stroke-width="2"/>`,
  photo:
    `<rect x="3" y="5" width="18" height="14" rx="3.2" ${STROKE} stroke-width="1.9"/>` +
    '<circle cx="8.6" cy="10" r="1.7" fill="currentColor"/>' +
    `<path d="m3.8 17 4.8-4.3 3.6 3 3-2.6 5 4.3" ${STROKE} stroke-width="1.9"/>`,
  close: `<path d="M7.5 7.5l9 9M16.5 7.5l-9 9" ${STROKE} stroke-width="2.4"/>`,
  lock:
    `<rect x="5" y="10.5" width="14" height="10" rx="2.5" ${STROKE} stroke-width="1.9"/>` +
    `<path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" ${STROKE} stroke-width="1.9"/>`,
  check: `<path d="m5.5 12.5 4.2 4.2 8.8-9.4" ${STROKE} stroke-width="2.6"/>`,
  send: `<path d="M20.5 3.5 10 14M20.5 3.5l-6.4 17-4.1-6.5-6.5-4.1z" ${STROKE} stroke-width="2"/>`,
  trash:
    `<path d="M4.5 7h15M9.5 7V5.2c0-.7.5-1.2 1.2-1.2h2.6c.7 0 1.2.5 1.2 1.2V7" ${STROKE} stroke-width="1.9"/>` +
    `<path d="M6.5 7l.9 11.4a2 2 0 0 0 2 1.8h5.2a2 2 0 0 0 2-1.8L17.5 7M10.2 11v5.2M13.8 11v5.2" ${STROKE} stroke-width="1.9"/>`,
});

/** Line drawing of an open envelope with a letter half out, for the empty Archive (100×110, currentColor). */
export const ENVELOPE_ILLUSTRATION =
  '<ellipse cx="50" cy="103" rx="32" ry="3.2" fill="currentColor" fill-opacity=".16"/>' +
  '<path d="M20 40h60a6 6 0 0 1 6 6v42a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6V46a6 6 0 0 1 6-6z" ' +
  'fill="currentColor" fill-opacity=".12" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>' +
  '<path d="M16 43 50 20l34 23" fill="currentColor" fill-opacity=".08" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-opacity=".7"/>' +
  '<path d="M27 15h46a3 3 0 0 1 3 3v62H24V18a3 3 0 0 1 3-3z" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' +
  '<path d="M32 26h36M32 33h36M32 40h24" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-opacity=".6"/>' +
  '<path d="M14 50l36 24 36-24v38a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6z" fill="#fff"/>' +
  '<path d="M14 50l36 24 36-24v38a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6z" ' +
  'fill="currentColor" fill-opacity=".16" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>';
