/**
 * The picker's frame in each prompt state. While active it is the fixed-height list; once the user
 * answers or cancels it collapses to a few lines, like clack's own prompts, so the screen does not
 * keep a 40-row list and a "space tick" footer after the choice.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderFrame } from '../../dist-cli/wizard/picker/render';
import type { RenderFrameOptions } from '../../dist-cli/wizard/picker/render';
import type { FlatRow } from '../../dist-cli/wizard/picker/layout';
import { stripAnsi } from '../helpers/ansi';

const MESSAGE = 'Select artifacts to install';
const ITEM_COUNT = 30;
const TERMINAL = { terminalRows: 40, terminalColumns: 100 };

const rows: FlatRow[] = [
  { group: true, label: 'typescript', value: 'typescript' },
  ...Array.from({ length: ITEM_COUNT }, (_, i) => ({
    group: 'typescript',
    kind: 'item' as const,
    value: `skill:typescript/item-${i}`,
    id: `typescript/item-${i}`,
    kindNoun: 'skill',
    stateLabel: 'new',
    stateGlyph: '＋',
    description: 'A short description.',
  })),
];

function frame(state: string, picked: string[] = []): string[] {
  const opts: RenderFrameOptions = {
    message: MESSAGE,
    options: rows,
    cursor: 3,
    selected: new Set(picked),
    footerHint: 'space tick',
    state,
    ...TERMINAL,
  };
  return stripAnsi(renderFrame(opts)).split('\n');
}

describe('picker frame by prompt state', () => {
  it('should start every frame with the gutter bar, like clack prompts do', () => {
    for (const state of ['active', 'submit', 'cancel']) {
      assert.equal(frame(state)[0], '│', state);
    }
  });

  it('should collapse to the question and the number picked once answered', () => {
    const lines = frame('submit', ['a', 'b', 'c']);
    assert.deepEqual(lines, ['│', `◇  ${MESSAGE}`, '│  3 picked']);
  });

  it('should collapse to the question alone when cancelled', () => {
    assert.deepEqual(frame('cancel'), ['│', `■  ${MESSAGE}`]);
  });

  it('should keep the list and the key hints while active', () => {
    const lines = frame('active');
    assert.ok(lines.length > 10);
    assert.match(lines[1] ?? '', /^◆ {2}Select artifacts/);
    assert.match(lines[lines.length - 1] ?? '', /^└ {2}space tick/);
  });

  it('should keep the same height for every cursor and selection while active', () => {
    const heights = new Set<number>();
    for (let cursor = 0; cursor < rows.length; cursor += 1) {
      const opts: RenderFrameOptions = {
        message: MESSAGE,
        options: rows,
        cursor,
        selected: new Set(cursor % 2 ? ['x'] : []),
        footerHint: 'space tick',
        state: 'active',
        ...TERMINAL,
      };
      heights.add(renderFrame(opts).split('\n').length);
    }
    assert.equal(heights.size, 1);
  });
});

const WINDOWS = {
  columns: [24, 30, 40, 60, 80, 100, 160, 240],
  rows: [12, 14, 18, 24, 40, 60],
};
const LONG_ROWS: FlatRow[] = rows.map(row =>
  'id' in row
    ? { ...row, id: `${row.id}-with-a-very-long-artifact-name`, description: 'Long. '.repeat(60) }
    : row,
);

function activeAt(columns: number, terminalRows: number, cursor: number, options = LONG_ROWS) {
  const opts: RenderFrameOptions = {
    message: `${MESSAGE} and then a good deal more words than any window can hold`,
    options,
    cursor,
    selected: new Set(['x']),
    footerHint: 'space tick   ·   enter  confirm   ·   ← Back row  go back   ·   ctrl+c  quit',
    state: 'active',
    terminalColumns: columns,
    terminalRows,
  };
  return stripAnsi(renderFrame(opts)).split('\n');
}

describe('picker frame at every window size', () => {
  it('should fit every line in the window and leave a row free, so a redraw never overlaps', () => {
    for (const columns of WINDOWS.columns) {
      for (const terminalRows of WINDOWS.rows) {
        for (const cursor of [0, 7, rows.length - 1]) {
          const lines = activeAt(columns, terminalRows, cursor);
          const where = `${columns}x${terminalRows} cursor ${cursor}`;
          assert.ok(lines.length <= terminalRows - 1, `${where}: ${lines.length} lines`);
          for (const line of lines) {
            assert.ok(line.length <= columns - 1, `${where}: ${JSON.stringify(line)}`);
          }
        }
      }
    }
  });

  it('should keep the height constant for every cursor at each window size', () => {
    for (const columns of WINDOWS.columns) {
      for (const terminalRows of WINDOWS.rows) {
        const heights = new Set(
          LONG_ROWS.map((_, cursor) => activeAt(columns, terminalRows, cursor).length),
        );
        assert.equal(heights.size, 1, `${columns}x${terminalRows}: ${[...heights]}`);
      }
    }
  });

  it('should collapse to short lines that fit once answered, at any width', () => {
    for (const columns of WINDOWS.columns) {
      for (const state of ['submit', 'cancel']) {
        const opts: RenderFrameOptions = {
          message: `${MESSAGE} and then a good deal more words than any window can hold`,
          options: LONG_ROWS,
          cursor: 0,
          selected: new Set(['x']),
          footerHint: 'hint',
          state,
          terminalColumns: columns,
          terminalRows: 30,
        };
        for (const line of stripAnsi(renderFrame(opts)).split('\n')) {
          assert.ok(line.length <= columns - 1, `${columns} ${state}: ${JSON.stringify(line)}`);
        }
      }
    }
  });
});
