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
