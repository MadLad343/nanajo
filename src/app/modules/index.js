import { archiveModule } from './archive/index.js';
import { newEntryModule } from './newEntry/index.js';
import { settingsModule } from './settings/index.js';

/**
 * The Home menu, in order. Each destination has a directory here with its
 * definition (index.js) and entry point; the letters they share, with their
 * screens and storage, live in ../letters/.
 * @type {import('../registry.js').ModuleDefinition[]}
 */
export const modules = [settingsModule, newEntryModule, archiveModule];
