/**
 * Archive: read, send and delete the entries saved so far. Last on Home.
 * @type {import('../../registry.js').ModuleDefinition}
 */
export const archiveModule = {
  id: 'archive',
  title: 'Archive',
  caption: 'Read and send saved entries',
  tint: '#8a7dff',
  // A page stack of its own (list, entry, send, preview).
  layout: 'full',
  // An archive box.
  icon:
    '<path d="M4.5 3.5h15A1.5 1.5 0 0 1 21 5v2.5A1.5 1.5 0 0 1 19.5 9h-15A1.5 1.5 0 0 1 3 7.5V5a1.5 1.5 0 0 1 1.5-1.5z"/>' +
    '<path fill-rule="evenodd" d="M4.2 10.4h15.6v8.1a2.5 2.5 0 0 1-2.5 2.5H6.7a2.5 2.5 0 0 1-2.5-2.5zm5.6 2.3a.95.95 0 0 0 0 1.9h4.4a.95.95 0 0 0 0-1.9z"/>',
  load: () => import('./entry.js'),
};
