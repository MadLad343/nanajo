import { confirmSheet } from '../../letters/components/confirmSheet.js';
import { createArchiveHome } from '../../letters/frames/archiveHome.js';
import { createEntryViewer } from '../../letters/frames/entryViewer.js';
import { createSendPage } from '../../letters/frames/sendPage.js';
import { createSendPreview } from '../../letters/frames/sendPreview.js';
import { formatLongDate } from '../../letters/logic/dates.js';
import { useDocumentFont } from '../../letters/logic/pdfExport.js';
import { h } from '../../ui/dom.js';
import { createPageStack } from '../../ui/pageStack.js';

/**
 * @typedef {import('../../letters/logic/storage.js').Entry} Entry
 */

/**
 * Archive: every saved entry, newest first. Entries are sealed: one can be
 * read in full or deleted, and Send puts the ones not sent yet (or any chosen)
 * into one PDF for the share sheet. Letters are kept only on this device;
 * nothing leaves it unless the user shares the PDF.
 * @type {import('../../registry.js').ModuleEntry['mount']}
 */
export async function mount(root, { letters, notify, setHeader }) {
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

  const stack = createPageStack({
    root: createArchiveHome({ journal, openEntry, openSend }),
    setHeader,
  });
  host.append(stack.el);

  /** @param {string} id */
  function openEntry(id) {
    const entry = journal.get(id);
    if (entry) stack.push(createEntryViewer({ entry, journal, onDelete: remove }));
  }

  /** @param {Entry} entry */
  async function remove(entry) {
    const confirmed = await confirmSheet(host, {
      title: '이 이야기 지우는 거 맞아?',
      message: `${formatLongDate(entry.createdAt, entry.tz)}에 쓴 이야기와 사진이 Archive에서 사라져.`,
      confirm: '지울래!',
      cancel: '안지울래!',
    });
    if (!confirmed) return;
    try {
      await journal.remove(entry.id);
    } catch (error) {
      report(error, '못 지웠어ㅠㅠ');
      return;
    }
    await stack.popToRoot();
    notify('지웠어!');
  }

  function openSend() {
    stack.push(
      createSendPage({
        journal,
        report,
        onReady: (letter) =>
          stack.push(createSendPreview({ letter, journal, notify, report, onSent: () => stack.popToRoot() })),
      }),
    );
  }

  return () => {
    stack.destroy();
    host.remove();
  };
}
