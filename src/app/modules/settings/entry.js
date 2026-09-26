import { createSettingsPage } from '../../letters/frames/settingsPage.js';
import { createPageStack } from '../../ui/pageStack.js';

/**
 * Settings holds the letter's own preferences: who it is for.
 * @type {import('../../registry.js').ModuleEntry['mount']}
 */
export async function mount(root, { letters, notify, setHeader }) {
  /** @param {unknown} error @param {string} message */
  const report = (error, message) => {
    console.error(`[settings] ${message}`, error instanceof Error ? error.name : '');
    notify(message);
  };

  const journal = await letters();
  const page = createSettingsPage({ journal, report });
  const stack = createPageStack({ root: page, setHeader });
  stack.el.classList.add('settings');
  root.append(stack.el);

  // iOS may end a backgrounded Home Screen app without warning; keep typing first.
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') page.save();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    page.save();
    stack.destroy();
    stack.el.remove();
  };
}
