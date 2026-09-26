import { createEntryEditor } from '../../letters/frames/entryEditor.js';
import { useDocumentFont } from '../../letters/logic/pdfExport.js';
import { h } from '../../ui/dom.js';
import { createPageStack } from '../../ui/pageStack.js';

/**
 * New Entry is the editor on its own. There is one draft at a time, so
 * unfinished writing is picked up where it was left. Saving or discarding
 * returns Home.
 * @type {import('../../registry.js').ModuleEntry['mount']}
 */
export async function mount(root, { letters, close, notify, setHeader }) {
  // Messages here never include letter content.
  /** @param {unknown} error @param {string} message */
  const report = (error, message) => {
    console.error(`[letters] ${message}`, error instanceof Error ? error.name : '');
    notify(message);
  };

  const journal = await letters();
  // Letter text is shown in the same serif the PDF uses; until it loads, a system serif stands in.
  useDocumentFont().catch(() => {});

  const host = h('div', { class: 'letters' });
  root.append(host);

  /** @type {ReturnType<typeof createPageStack>} */
  let stack;
  const editor = createEntryEditor({
    journal,
    draft: journal.draft(),
    host,
    push: (page) => stack.push(page),
    leave: close,
    notify,
    report,
  });
  stack = createPageStack({ root: editor, setHeader });
  host.append(stack.el);

  return () => {
    stack.destroy();
    host.remove();
  };
}
