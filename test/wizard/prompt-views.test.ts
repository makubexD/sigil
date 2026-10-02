/**
 * The prompt renderers over every window size and state: each line fits the window, a long list
 * never grows past the screen, an answered prompt collapses, and a long text value scrolls with the
 * cursor in view instead of wrapping. Pure functions, so every size is cheap to try.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderConfirm,
  renderMultiSelect,
  renderSelect,
  renderText,
  textWindow,
} from '../../dist-cli/wizard/prompt-views';
import type { PromptState } from '../../dist-cli/wizard/prompt-fit';
import { stripAnsi } from '../helpers/ansi';
import { withWindow } from '../helpers/window';

const COLUMNS = [24, 30, 40, 60, 80, 120, 240];
const ROWS = [12, 14, 18, 24, 40, 60];
const MESSAGE =
  'Which artifacts do you want to remove?  (Space ticks, Enter confirms, Ctrl+C goes back)';
const OPTIONS = Array.from({ length: 60 }, (_, i) => ({
  value: `id-${i}`,
  label: `typescript/ts-a-rather-long-artifact-name-number-${i}`,
  hint: 'rule · ⚠ no longer in the catalog · required by typescript/ts-code-reviewer',
}));
const LONG_VALUE = `C:\\Users\\someone\\${'a-deeply-nested-folder\\'.repeat(6)}project`;

const lines = (frame: string): string[] => stripAnsi(frame).split('\n');

/** Every size, with `check` given the window it ran in. */
async function everySize(check: (columns: number, rows: number) => void): Promise<void> {
  for (const columns of COLUMNS) {
    for (const rows of ROWS) await withWindow({ columns, rows }, () => check(columns, rows));
  }
}

describe('select', () => {
  const view = (state: PromptState, cursor: number) => ({
    state,
    message: MESSAGE,
    options: OPTIONS,
    cursor,
  });

  it('should fit every line and leave a row free, at every size', async () => {
    await everySize((columns, rows) => {
      for (const cursor of [0, 5, 30, 59]) {
        const frame = lines(renderSelect(view('active', cursor)));
        const where = `${columns}x${rows} cursor ${cursor}`;
        assert.ok(frame.length <= rows - 1, `${where}: ${frame.length} lines`);
        for (const line of frame) assert.ok(line.length <= columns - 1, `${where}: ${line}`);
      }
    });
  });

  it('should keep one height while the cursor moves, so a redraw erases exactly what it drew', async () => {
    await everySize((columns, rows) => {
      const heights = new Set(OPTIONS.map((_, c) => lines(renderSelect(view('active', c))).length));
      assert.equal(heights.size, 1, `${columns}x${rows}: ${[...heights]}`);
    });
  });

  it('should collapse to the question and the answer once answered', async () => {
    await withWindow({ columns: 60, rows: 24 }, () => {
      assert.equal(lines(renderSelect(view('submit', 2))).length, 3);
      assert.match(
        stripAnsi(renderSelect(view('submit', 2))),
        /ts-a-rather-long-artifact-name-number-2$/,
      );
    });
  });

  it('should show the cursor row with its hint and the others without', () => {
    const frame = stripAnsi(renderSelect(view('active', 1)));
    assert.match(frame, /● typescript\/ts-a-rather-long-artifact-name-number-1 \(rule/);
    assert.doesNotMatch(frame, /number-0 \(/);
  });
});

describe('multiselect', () => {
  const view = (state: PromptState, picked: number) => ({
    state,
    message: MESSAGE,
    options: OPTIONS,
    cursor: 3,
    value: OPTIONS.slice(0, picked).map(o => o.value),
    error: 'Please select at least one option.\nPress space to select, enter to submit',
  });

  it('should fit every line, in the active and the error state, at every size', async () => {
    await everySize((columns, rows) => {
      for (const state of ['active', 'error'] as const) {
        const frame = lines(renderMultiSelect(view(state, 5)));
        const where = `${columns}x${rows} ${state}`;
        assert.ok(frame.length <= rows - 1, `${where}: ${frame.length} lines`);
        for (const line of frame) assert.ok(line.length <= columns - 1, `${where}: ${line}`);
      }
    });
  });

  it('should answer with a count however many are ticked, never a list of ids', async () => {
    await everySize((columns, rows) => {
      const frame = lines(renderMultiSelect(view('submit', 40)));
      assert.equal(frame.length, 3, `${columns}x${rows}`);
      assert.match(frame[2] ?? '', /^│ {2}40 selected/);
    });
  });

  it('should name the choice when only a few are ticked, and say none when none are', () => {
    assert.match(
      stripAnsi(renderMultiSelect(view('submit', 2))),
      /2 selected: typescript\/ts-a-rather/,
    );
    assert.match(stripAnsi(renderMultiSelect(view('submit', 0))), /│ {2}none$/);
  });

  it('should show the refusal under the list when nothing is ticked', () => {
    assert.match(
      stripAnsi(renderMultiSelect(view('error', 0))),
      /Please select at least one option/,
    );
  });
});

describe('confirm', () => {
  it('should fit every line and collapse to the answer, at every size', async () => {
    await everySize((columns, rows) => {
      const base = { message: `${MESSAGE} ${MESSAGE}`, value: true, active: 'Yes', inactive: 'No' };
      for (const state of ['active', 'submit', 'cancel'] as const) {
        for (const line of lines(renderConfirm({ ...base, state }))) {
          assert.ok(line.length <= columns - 1, `${columns}x${rows} ${state}: ${line}`);
        }
      }
      assert.equal(lines(renderConfirm({ ...base, state: 'submit' })).length, 3);
    });
  });
});

describe('text', () => {
  const view = (state: PromptState, cursor: number, value = LONG_VALUE) => ({
    state,
    message: MESSAGE,
    placeholder: LONG_VALUE,
    value,
    cursor,
    error: 'That folder does not exist and cannot be created here because a parent is a file',
  });

  it('should fit every line in every state, for a long value, at every size', async () => {
    await everySize((columns, rows) => {
      for (const state of ['active', 'error', 'submit', 'cancel'] as const) {
        for (const cursor of [0, 10, LONG_VALUE.length]) {
          for (const value of ['', LONG_VALUE]) {
            for (const line of lines(renderText(view(state, cursor, value)))) {
              const where = `${columns}x${rows} ${state} cursor ${cursor}`;
              assert.ok(line.length <= columns - 1, `${where}: ${line}`);
            }
          }
        }
      }
    });
  });

  it('should collapse to the question and the value once answered', async () => {
    await withWindow({ columns: 40, rows: 24 }, () => {
      assert.equal(lines(renderText(view('submit', 0))).length, 3);
    });
  });
});

describe('textWindow', () => {
  const VALUE = 'abcdefghijklmnopqrstuvwxyz0123456789'.repeat(3);

  it('should show everything, with the cursor, when there is room or no window', () => {
    assert.equal(stripAnsi(textWindow('hello', 5, undefined)), 'hello ');
    assert.equal(stripAnsi(textWindow('hello', 2, 40)), 'hello');
  });

  it('should always fit the room and keep the cursor character in view', () => {
    for (let room = 6; room <= 50; room += 1) {
      for (let cursor = 0; cursor <= VALUE.length; cursor += 1) {
        const shown = stripAnsi(textWindow(VALUE, cursor, room));
        const where = `room ${room} cursor ${cursor}: ${JSON.stringify(shown)}`;
        assert.ok(shown.length <= room, where);
        const core = shown.replace(/^…/, '').replace(/…$/, '');
        const under = cursor < VALUE.length ? VALUE[cursor] : ' ';
        assert.ok(core.includes(under as string), where);
        assert.ok(VALUE.includes(core.trimEnd()), where);
      }
    }
  });

  it('should mark a cut with an ellipsis on the side that continues', () => {
    assert.match(stripAnsi(textWindow(VALUE, 0, 20)), /^[^…]+…$/);
    assert.match(stripAnsi(textWindow(VALUE, VALUE.length, 20)), /^….+$/);
    assert.match(stripAnsi(textWindow(VALUE, 50, 20)), /^….*…$/);
  });
});
