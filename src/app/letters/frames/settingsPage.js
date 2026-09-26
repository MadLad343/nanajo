import { h } from '../../ui/dom.js';
import { renderGroup } from '../../ui/list.js';

/**
 * @typedef {object} SettingsPageOptions
 * @property {import('../logic/entries.js').Journal} journal
 * @property {(error: unknown, message: string) => void} report
 */

/**
 * Settings: who the letter is for, shown in Archive and on the PDF's cover.
 * The name is kept when the field is left, or by calling `save()`.
 * @param {SettingsPageOptions} options
 */
export function createSettingsPage({ journal, report }) {
  const input = h('input', {
    class: 'field__input',
    attrs: {
      type: 'text',
      placeholder: 'Optional',
      autocomplete: 'off',
      autocapitalize: 'words',
      enterkeyhint: 'done',
      maxlength: '80',
      'aria-label': 'For',
    },
  });
  input.value = journal.recipient();

  async function save() {
    try {
      await journal.setRecipient(input.value);
    } catch (error) {
      report(error, 'Couldn’t save the name.');
    }
  }
  input.addEventListener('change', save);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') input.blur();
  });

  const el = h(
    'div',
    { class: 'settings-page' },
    renderGroup(
      { title: 'Letter', footer: 'Who your letter is for. Shown in Archive and on the cover of the PDF. Leave empty for none.' },
      h('label', { class: 'row field' }, h('span', { class: 'field__label', text: 'For' }), input),
    ),
    h('p', {
      class: 'group__footer',
      text:
        'Your entries are kept only on this iPhone, and removing the app from the Home Screen erases them. ' +
        'To keep a copy, send yourself a PDF from Archive.',
    }),
  );

  /** @type {import('../../ui/pageStack.js').Page & { save: () => Promise<void> }} */
  const page = { el, title: 'Settings', save };
  return page;
}
