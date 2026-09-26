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
      placeholder: '비워둬도 돼!',
      autocomplete: 'off',
      autocapitalize: 'words',
      enterkeyhint: 'done',
      maxlength: '80',
      'aria-label': '받는 사람',
    },
  });
  input.value = journal.recipient();

  async function save() {
    try {
      await journal.setRecipient(input.value);
    } catch (error) {
      report(error, '이름 저장 못했어ㅠㅠ');
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
      { title: '편지' },
      h('label', { class: 'row field' }, h('span', { class: 'field__label', text: '받는 사람' }), input),
    ),
  );

  /** @type {import('../../ui/pageStack.js').Page & { save: () => Promise<void> }} */
  const page = { el, title: 'Settings', save };
  return page;
}
