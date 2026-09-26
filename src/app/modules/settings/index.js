/**
 * Settings: who the letter is for. First on Home, left of New Entry.
 * @type {import('../../registry.js').ModuleDefinition}
 */
export const settingsModule = {
  id: 'settings',
  title: 'Settings',
  caption: '누구한테 쓰는 편지야?',
  tint: '#8795b8',
  // A page stack of its own, like the other destinations.
  layout: 'full',
  icon: '<path fill-rule="evenodd" d="M9.94 4.58L10.30 1.84A10.3 10.3 0 0 1 13.70 1.84L14.06 4.58A7.7 7.7 0 0 1 15.79 5.30L17.98 3.61A10.3 10.3 0 0 1 20.39 6.02L18.70 8.21A7.7 7.7 0 0 1 19.42 9.94L22.16 10.30A10.3 10.3 0 0 1 22.16 13.70L19.42 14.06A7.7 7.7 0 0 1 18.70 15.79L20.39 17.98A10.3 10.3 0 0 1 17.98 20.39L15.79 18.70A7.7 7.7 0 0 1 14.06 19.42L13.70 22.16A10.3 10.3 0 0 1 10.30 22.16L9.94 19.42A7.7 7.7 0 0 1 8.21 18.70L6.02 20.39A10.3 10.3 0 0 1 3.61 17.98L5.30 15.79A7.7 7.7 0 0 1 4.58 14.06L1.84 13.70A10.3 10.3 0 0 1 1.84 10.30L4.58 9.94A7.7 7.7 0 0 1 5.30 8.21L3.61 6.02A10.3 10.3 0 0 1 6.02 3.61L8.21 5.30A7.7 7.7 0 0 1 9.94 4.58zM12 8.7a3.3 3.3 0 1 0 0 6.6a3.3 3.3 0 1 0 0-6.6z"/>',
  load: () => import('./entry.js'),
};
