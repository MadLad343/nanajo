/**
 * Entries store an absolute time (ms since the epoch) plus the UTC offset the
 * device had when the entry was written. Dates are formatted only for display,
 * in that original offset, so an entry always shows the time it was written
 * where it was written, even after travelling or a daylight-saving change.
 */

/** @type {Map<string, Intl.DateTimeFormat>} */
const formats = new Map();

/** Minutes east of UTC right now, as stored with a new entry. */
export function currentOffset() {
  return -new Date().getTimezoneOffset();
}

/**
 * @param {number} ms
 * @param {number | null} tz  Minutes east of UTC, or null for the device's zone.
 * @param {Intl.DateTimeFormatOptions} options
 */
function format(ms, tz, options) {
  const key = `${tz === null}:${JSON.stringify(options)}`;
  let formatter = formats.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(undefined, tz === null ? options : { ...options, timeZone: 'UTC' });
    formats.set(key, formatter);
  }
  return formatter.format(tz === null ? ms : ms + tz * 60_000);
}

/** "Wednesday, February 3, 2027" @param {number} ms @param {number | null} tz */
export const formatLongDate = (ms, tz) => format(ms, tz, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

/** "February 3, 2027" @param {number} ms @param {number | null} tz */
export const formatDate = (ms, tz) => format(ms, tz, { year: 'numeric', month: 'long', day: 'numeric' });

/** "February 3" @param {number} ms @param {number | null} tz */
export const formatMonthDay = (ms, tz) => format(ms, tz, { month: 'long', day: 'numeric' });

/** "Wed, February 3" @param {number} ms @param {number | null} tz */
export const formatCardDate = (ms, tz) => format(ms, tz, { weekday: 'short', month: 'long', day: 'numeric' });

/** "20:41" or "8:41 PM", following the device's settings. @param {number} ms @param {number | null} tz */
export const formatTime = (ms, tz) => format(ms, tz, { hour: 'numeric', minute: '2-digit' });

/** "February 2027" @param {number} ms @param {number | null} tz */
export const formatMonth = (ms, tz) => format(ms, tz, { year: 'numeric', month: 'long' });

/** Groups entries by the month they were written in. @param {number} ms @param {number | null} tz */
export function monthKey(ms, tz) {
  const offset = tz ?? -new Date(ms).getTimezoneOffset();
  const local = new Date(ms + offset * 60_000);
  return local.getUTCFullYear() * 12 + local.getUTCMonth();
}
