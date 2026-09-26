/**
 * The letters: every saved entry, the one unfinished draft, and who the
 * letter is for. New Entry, Archive and Settings all work on this single
 * collection. It loads on first use (its code included) and is then shared,
 * so a change made in one screen is already current in the next.
 *
 * @typedef {import('./logic/entries.js').Journal} Journal
 * @typedef {() => Promise<Journal>} Letters
 */

/** Unused photo records are cleared this long after loading, once startup work is done. */
const CLEANUP_DELAY_MS = 4000;

/**
 * @param {import('../storage.js').KeyValueStore} kv  The app's `letters` namespace.
 * @returns {Letters}
 */
export function createLetters(kv) {
  /** @type {Promise<Journal> | null} */
  let pending = null;
  return () => {
    pending ??= import('./logic/entries.js')
      .then(({ createJournal }) => createJournal(kv))
      .then(
        (journal) => {
          // e.g. photos from a draft the app was closed on, then discarded.
          setTimeout(() => journal.collectGarbage().catch(() => {}), CLEANUP_DELAY_MS);
          return journal;
        },
        (error) => {
          pending = null;
          throw error;
        },
      );
    return pending;
  };
}
