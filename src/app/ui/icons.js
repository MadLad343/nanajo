const STROKE = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';

/** Inner markup for 24×24 interface glyphs. */
export const ICONS = Object.freeze({
  chevronLeft: `<path d="M14.5 5.5 8 12l6.5 6.5" ${STROKE} stroke-width="2.4"/>`,
  alert:
    '<circle cx="12" cy="12" r="9.25" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
    '<path d="M12 7.5v5.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
    '<circle cx="12" cy="16.4" r="1.25" fill="currentColor"/>',
  document:
    `<path d="M13.5 3H7.5a2.5 2.5 0 0 0-2.5 2.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8.5z" ${STROKE} stroke-width="1.9"/>` +
    `<path d="M13.5 3v3.5a2 2 0 0 0 2 2H19M9 13h6M9 16.5h4" ${STROKE} stroke-width="1.9"/>`,
});
