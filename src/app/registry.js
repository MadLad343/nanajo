/**
 * @typedef {object} ModuleContext
 * @property {ModuleDefinition} module
 * @property {import('./letters/index.js').Letters} letters  The letter collection shared by every module, loaded on first use.
 * @property {() => void} close  Return to the Home frame.
 * @property {(message: string | import('./ui/toast.js').ToastOptions) => void} notify
 *   Show a brief, non-blocking message, optionally with one action (e.g. Undo).
 * @property {(header: ModuleHeader, direction?: number) => void} setHeader
 *   For modules with screens of their own: retitles the bar and redirects its
 *   back button. Omitting `back` restores the default "Home" button. A non-zero
 *   direction (1 = deeper, -1 = back) animates the change and moves focus to the title.
 */

/**
 * @typedef {object} ModuleHeader
 * @property {string} title
 * @property {{ label: string, run: () => void }} [back]
 */

/**
 * @typedef {() => void} Unmount
 * @typedef {object} ModuleEntry
 * @property {(root: HTMLElement, context: ModuleContext) => void | Unmount | Promise<void | Unmount>} mount
 *   Renders the module into `root`; may return a cleanup function that runs when the module closes.
 */

/**
 * @typedef {object} ModuleDefinition
 * @property {string} id  Stable, unique identifier.
 * @property {string} title
 * @property {string} icon  Inner SVG markup for a 24×24 viewBox; shapes are filled with the tint.
 * @property {string} [tint]  Accent color (any CSS color).
 * @property {string} [caption]  Short secondary line shown under the title.
 * @property {'padded' | 'full'} [layout]  `full` gives the module an unpadded, non-scrolling
 *   body, for modules that manage their own scroll areas. Defaults to `padded`.
 * @property {() => Promise<ModuleEntry>} load  Lazily imports the module's entry point.
 */

/**
 * @typedef {object} Registry
 * @property {readonly ModuleDefinition[]} modules
 * @property {(id: unknown) => number} indexOf  -1 when not registered.
 */

const LAYOUTS = ['padded', 'full'];

/**
 * Validates definitions and freezes the module list. Invalid or duplicate
 * definitions are skipped with a console warning rather than breaking startup.
 * @param {readonly ModuleDefinition[]} definitions
 * @returns {Registry}
 */
export function createRegistry(definitions) {
  /** @type {ModuleDefinition[]} */
  const modules = [];
  const ids = new Set();

  for (const definition of definitions) {
    const problem = validate(definition, ids);
    if (problem) {
      console.warn(`[registry] Skipped module: ${problem}`, definition);
      continue;
    }
    ids.add(definition.id);
    modules.push(Object.freeze({ ...definition, load: memoizeLoad(definition) }));
  }

  const frozen = Object.freeze(modules);
  return Object.freeze({
    modules: frozen,
    indexOf: (id) => frozen.findIndex((module) => module.id === id),
  });
}

/**
 * @param {ModuleDefinition} definition
 * @param {Set<string>} ids
 */
function validate(definition, ids) {
  if (!definition || typeof definition !== 'object') return 'definition is not an object';
  if (typeof definition.id !== 'string' || !definition.id) return 'missing id';
  if (ids.has(definition.id)) return `duplicate id "${definition.id}"`;
  if (typeof definition.title !== 'string' || !definition.title) return `"${definition.id}" is missing a title`;
  if (typeof definition.icon !== 'string') return `"${definition.id}" is missing an icon`;
  if (typeof definition.load !== 'function') return `"${definition.id}" is missing load()`;
  if (definition.layout !== undefined && !LAYOUTS.includes(definition.layout)) {
    return `"${definition.id}" has an unknown layout "${definition.layout}"`;
  }
  return null;
}

/**
 * Loads each module once, verifies its entry point, and allows a retry after
 * a failure (e.g. the file was not cached and the device is offline).
 * @param {ModuleDefinition} definition
 */
function memoizeLoad(definition) {
  /** @type {Promise<ModuleEntry> | null} */
  let pending = null;
  return () => {
    pending ??= definition.load().then(
      (entry) => {
        if (typeof entry?.mount !== 'function') {
          throw new Error(`Module "${definition.id}" does not export mount().`);
        }
        return entry;
      },
      (error) => {
        pending = null;
        throw error;
      },
    );
    return pending;
  };
}
