/**
 * New Entry: write the next part of the letter. In the middle of Home, and the
 * card Home opens on.
 * @type {import('../../registry.js').ModuleDefinition}
 */
export const newEntryModule = {
  id: 'new-entry',
  title: 'New Entry',
  caption: '오늘 이야기 쓰러 가자!',
  tint: '#1f9fb5',
  // A page stack of its own (editor, review).
  layout: 'full',
  // A fountain-pen nib.
  icon:
    '<path fill-rule="evenodd" d="M8 3h8a1 1 0 0 1 1 1v2.2c0 .5.2 1 .6 1.3 1.1 1 1.9 2.4 1.9 4 0 2.2-1.2 4.2-3.1 5.9L12 21.5l-4.4-4.1C5.7 15.7 4.5 13.7 4.5 11.5c0-1.6.8-3 1.9-4 .4-.3.6-.8.6-1.3V4a1 1 0 0 1 1-1zM12 9.4a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4zm-.55 3.5v5.4h1.1v-5.4z"/>',
  load: () => import('./entry.js'),
};
