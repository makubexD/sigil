/**
 * Regression test for the wizard picker's phantom-selection / duplicated-block bug (fixed via
 * `src/wizard/picker/`). Root cause: the old `groupMultiselect` render produced a frame whose row
 * count varied with cursor position (via the active row's inline, unbounded description), which
 * broke `@clack/core`'s cursor-relative repaint diffing once the frame outgrew the terminal.
 *
 * The direct fix is `buildListRows`'s length invariant: for a fixed `viewportRows`, its output
 * length never depends on `cursor`, `selected`, or any row's `description`. This test asserts
 * exactly that, plus the supporting window/wrap helpers.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildListRows,
  computeWindow,
  wrapDescription,
  type FlatRow,
} from '../../dist-cli/wizard/picker/layout';

const LONG_DESCRIPTION =
  'Add a new skill, agent, rule, or prompt to the sigil catalog through a guided interview. ' +
  'Suggests the right kind and which AIs it propagates to, scaffolds the frontmatter, and ' +
  'validates on save. DRY body authored once, emits to every targeted AI automatically.';

/** Builds a synthetic flattened option list: one header + `count` items under it. */
function makeOptions(count: number, descriptions: readonly string[] = []): FlatRow[] {
  const rows: FlatRow[] = [{ group: true, label: 'typescript', value: 'typescript' }];
  for (let i = 0; i < count; i++) {
    rows.push({
      group: 'typescript',
      kind: 'item',
      value: `skill:typescript/item-${i}`,
      id: `typescript/item-${i}`,
      kindNoun: 'skill',
      stateLabel: 'new',
      stateGlyph: '＋',
      description: descriptions[i] ?? 'A short description.',
    });
  }
  return rows;
}

describe('wizard picker layout — row-count invariant', () => {
  it('buildListRows returns the same number of rows for every cursor position', () => {
    const options = makeOptions(95);
    const viewportRows = 12;
    const lengths = new Set<number>();
    for (let cursor = 0; cursor < options.length; cursor++) {
      const rows = buildListRows(options, { cursor, selected: new Set(), viewportRows });
      lengths.add(rows.length);
    }
    assert.equal(lengths.size, 1, `row count varied across cursor positions: ${[...lengths]}`);
    assert.equal([...lengths][0], viewportRows);
  });

  it('row count is unaffected by the longest description in the catalog', () => {
    const withLongDesc = makeOptions(95, [LONG_DESCRIPTION]);
    const withShortDesc = makeOptions(95);
    const viewportRows = 12;

    for (const cursor of [0, 1, 40, 94]) {
      const a = buildListRows(withLongDesc, { cursor, selected: new Set(), viewportRows });
      const b = buildListRows(withShortDesc, { cursor, selected: new Set(), viewportRows });
      assert.equal(a.length, b.length);
      assert.equal(a.length, viewportRows);
    }
  });

  it('returns exactly the option count when it is smaller than the viewport', () => {
    const options = makeOptions(3);
    const rows = buildListRows(options, { cursor: 0, selected: new Set(), viewportRows: 12 });
    assert.equal(rows.length, options.length);
  });

  it('window width (end - start) is constant across cursor positions once scrolling engages', () => {
    const options = makeOptions(95);
    const viewportRows = 10;
    const widths = new Set<number>();
    for (let cursor = 0; cursor < options.length; cursor++) {
      const w = computeWindow(options, cursor, viewportRows);
      widths.add(w.end - w.start);
    }
    assert.deepEqual([...widths], [viewportRows]);
  });
});

describe('wrapDescription', () => {
  it('never exceeds maxLines', () => {
    const lines = wrapDescription(LONG_DESCRIPTION, 40, 3);
    assert.ok(lines.length <= 3);
  });

  it('returns no lines for empty text', () => {
    assert.deepEqual(wrapDescription('', 40, 3), []);
  });

  it('marks truncation with an ellipsis when content overflows maxLines', () => {
    const lines = wrapDescription(LONG_DESCRIPTION, 20, 2);
    assert.equal(lines.length, 2);
    assert.ok(lines[1]?.endsWith('…'));
  });
});
