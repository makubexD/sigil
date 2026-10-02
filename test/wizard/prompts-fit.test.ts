/**
 * Everything the user sees fits the window, at any width or zoom: log lines and notes wrap, console
 * output inside the menu keeps its gutter on every wrapped line, and prompt lines are cut instead of
 * wrapped (a wrapped prompt line is what leaves overlapping text behind when clack redraws it).
 * With no terminal (pipes, CI) nothing changes.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runInHomeFrame, withGutter } from '../../dist-cli/wizard/frame';
import { confirm, log, multiselect, note, select, text } from '../../dist-cli/wizard/prompts';
import { createRecorder, mockClack } from '../helpers/clack-mock';
import type { Recorder } from '../helpers/clack-mock';
import { assertFits } from '../helpers/home-flow';
import { stripAnsi } from '../helpers/ansi';
import { withWindow } from '../helpers/window';

/** Windows from a phone-sized terminal to a wide one; zooming in shrinks the columns the same way. */
const COLUMNS = [30, 40, 60, 80, 100, 120, 200];
const SENTENCE =
  'This is a sigil catalog checkout, so installs would land inside it. Pick the project to set up instead of this folder.';
const COMMAND = `sigil add ${'rule:typescript/ts-rule-name '.repeat(14)}--target claude --overwrite --yes`;
const MENU_LINES = [
  'Folder:      C:\\WorkSpaceMaku\\Others\\sigil\\some\\deeply\\nested\\project\\folder',
  'Set up for:  Claude Code and GitHub Copilot',
  'Installed:   19 installed · all healthy, 3 outdated, 2 edited, 1 no longer in the catalog',
];
const OPTIONS = [
  {
    value: 'a',
    label: 'Install artifacts (recommended)',
    hint: `Add skills, agents, rules and more. ${SENTENCE}`,
  },
  {
    value: 'b',
    label: 'Also set up for GitHub Copilot and every other tool that is left',
    hint: 'Create the folders',
  },
  { value: 'c', label: 'Quit', hint: '' },
  { value: 'd' },
];

/** Runs `fn` in a window and a mocked clack, and returns what was shown. */
async function shown(columns: number, fn: () => Promise<void> | void): Promise<Recorder> {
  const rec = createRecorder();
  const restore = mockClack(() => '::enter::', rec);
  try {
    await withWindow({ columns, rows: 30 }, fn);
  } finally {
    restore();
  }
  return rec;
}

describe('log, note and prompts at every window width', () => {
  for (const columns of COLUMNS) {
    it(`should fit everything in ${columns} columns`, async () => {
      const rec = await shown(columns, async () => {
        log.info(SENTENCE);
        log.warn(`${SENTENCE}\n  ${COMMAND}`);
        log.message(COMMAND);
        note(
          MENU_LINES.join('\n'),
          'This folder and a title that is much longer than the box can hold',
        );
        await select({ message: `Pick your project folder — ${MENU_LINES[0]}`, options: OPTIONS });
        await multiselect({ message: SENTENCE, options: OPTIONS });
        await confirm({ message: `${MENU_LINES[0]} does not exist yet. Create it?` });
        await text({
          message: SENTENCE,
          placeholder: COMMAND,
          initialValue: 'C:\\keep\\this\\whole\\',
        });
      });
      assertFits(rec, columns);
      assert.equal(rec.prompts.length, 4);
    });
  }

  it('should keep option values and the number of options, and the start of what it cuts', async () => {
    const rec = await shown(40, () => void select({ message: SENTENCE, options: OPTIONS }));
    const [prompt] = rec.prompts;
    assert.deepEqual(
      prompt?.options.map(o => o.value),
      OPTIONS.map(o => o.value),
    );
    assert.ok(prompt?.message.endsWith('…'));
    assert.ok(SENTENCE.startsWith((prompt?.message ?? '').slice(0, -1)));
  });

  it('should show a hint only while it leaves room, and keep the label whole', async () => {
    const rec = await shown(60, () => void select({ message: 'Pick', options: OPTIONS }));
    const first = rec.prompts[0]?.options[0];
    assert.equal(first?.label, 'Install artifacts (recommended)');
    assert.ok((first?.hint ?? '').endsWith('…'));
  });

  it('should leave the text a user edits untouched', async () => {
    const rec = createRecorder();
    const restore = mockClack(() => '::enter::', rec);
    let initial: unknown;
    try {
      await withWindow({ columns: 30 }, () => text({ message: 'Path', initialValue: COMMAND }));
      initial = rec.prompts[0]?.initialValue;
    } finally {
      restore();
    }
    assert.equal(initial, COMMAND);
  });
});

describe('with no terminal', () => {
  it('should pass every message and option through untouched', async () => {
    const rec = createRecorder();
    const restore = mockClack(() => '::enter::', rec);
    try {
      log.info(COMMAND);
      note(COMMAND, 'T');
      await select({ message: SENTENCE, options: OPTIONS });
    } finally {
      restore();
    }
    assert.deepEqual(rec.logs, [`info: ${COMMAND}`]);
    assert.equal(rec.notes[0]?.body, COMMAND);
    assert.equal(rec.prompts[0]?.message, SENTENCE);
    assert.equal(rec.prompts[0]?.options[0]?.hint, OPTIONS[0]?.hint);
  });
});

describe('console output inside the menu at every window width', () => {
  for (const columns of COLUMNS) {
    it(`should wrap with the gutter on every line in ${columns} columns`, async () => {
      const lines: string[] = [];
      const original = console.log;
      console.log = (text: unknown) => void lines.push(String(text));
      try {
        await withWindow({ columns }, () =>
          runInHomeFrame(() =>
            withGutter(async () => {
              console.log(
                `✓ 31 operation(s) applied to C:\\WorkSpaceMaku\\Others\\sigil, 1 artifact(s) not supported`,
              );
              console.log(
                `  .claude/skills/cli/references/stack-node-ts-and-more-and-more.md  (dependency)`,
              );
              console.log(`\nNext: ${SENTENCE}`);
            }),
          ),
        );
      } finally {
        console.log = original;
      }
      const all = lines.flatMap(entry => stripAnsi(entry).split('\n'));
      assert.ok(all.length > 3);
      for (const line of all) {
        assert.match(line, /^│/, JSON.stringify(line));
        assert.ok(line.length <= columns - 1, `${columns} columns: ${JSON.stringify(line)}`);
      }
    });
  }
});

describe('the recommended marker in a narrow window', () => {
  it('should keep "(recommended)" and shorten the words before it', async () => {
    const options = [
      { value: 'i', label: 'Install artifacts and a lot more (recommended)', hint: '' },
    ];
    for (const columns of [30, 40, 60]) {
      const rec = await shown(columns, () => void select({ message: 'Pick', options }));
      const label = rec.prompts[0]?.options[0]?.label ?? '';
      assert.ok(label.endsWith(' (recommended)'), `${columns}: ${label}`);
      assert.ok(label.length <= columns - 8, `${columns}: ${label}`);
    }
  });
});
