/**
 * Pure layout logic for `pickArtifacts` — no ANSI color, no clack, no I/O. Takes the flattened
 * option list `@clack/core`'s `GroupMultiSelectPrompt` builds internally (real rows plus
 * synthetic `{group: true}` header rows it inserts per group) and a fixed row budget, and returns
 * exactly that many rows.
 *
 * This is the fix for the wizard picker's phantom-selection / duplicated-block bug: the previous
 * `groupMultiselect` render grew with the option count (unbounded) AND with the active row's
 * description length (variable), so `@clack/core`'s cursor-relative repaint diffed against a frame
 * of a different height every keystroke and desynced. A layout function whose OUTPUT LENGTH is a
 * pure function of `viewportRows` alone — never of `cursor`, `selected`, or description length —
 * makes that repaint mismatch structurally impossible. See `test/wizard-picker-layout.test.ts` for
 * the regression test asserting exactly that invariant.
 *
 * @module
 */

/** One row `GroupMultiSelectPrompt.options` may contain — see its runtime shape in index.ts. */
export interface FlatHeaderRow {
  readonly group: true;
  readonly label: string;
  readonly value: string;
}
export interface FlatItemRow {
  readonly group: string;
  readonly kind: 'back' | 'item';
  readonly value: string;
  readonly id?: string;
  readonly kindNoun?: string;
  readonly stateLabel?: string;
  readonly stateGlyph?: string;
  readonly description?: string;
}
export type FlatRow = FlatHeaderRow | FlatItemRow;

export function isHeaderRow(row: FlatRow): row is FlatHeaderRow {
  return row.group === true;
}

/** Visible list window — always exactly `viewportRows` wide once `options.length > viewportRows`. */
export interface Window {
  readonly start: number;
  readonly end: number;
  readonly pinnedHeaderIndex: number | undefined;
}

/** How many list rows to show given terminal height, clamped to a sane range. */
export function computeViewportRows(terminalRows: number, optionCount: number): number {
  const MIN_ROWS = 3;
  const CHROME_ROWS = 9; // header + separator + detail header + 3 desc lines + footer + margin
  const available = Math.max(terminalRows - CHROME_ROWS, MIN_ROWS);
  return Math.min(available, Math.max(optionCount, 1));
}

const CENTER_DIVISOR = 2;

/** Centers the viewport on `cursor`, clamped to the option list bounds. */
function centeredWindow(
  len: number,
  cursor: number,
  viewportRows: number,
): { start: number; end: number } {
  if (len <= viewportRows) return { start: 0, end: len };
  let start = cursor - Math.floor(viewportRows / CENTER_DIVISOR);
  start = Math.max(0, Math.min(start, len - viewportRows));
  return { start, end: start + viewportRows };
}

/** Finds the header index for the group that owns `options[at]`, or undefined if `at` is itself a header. */
function ownerHeaderIndex(options: readonly FlatRow[], at: number): number | undefined {
  const row = options[at];
  if (!row || isHeaderRow(row)) return undefined;
  for (let i = at - 1; i >= 0; i--) {
    const candidate = options[i];
    if (candidate && isHeaderRow(candidate) && candidate.value === row.group) return i;
  }
  return undefined;
}

/**
 * Computes the visible window, pinning the current group's header as the window's first row when
 * scrolling has cut it off — so you always know which group you're in without growing the frame.
 * Pinning replaces the window's own first slot rather than inserting one, so `end - start` (and
 * therefore the number of rendered rows) never changes because of it.
 */
export function computeWindow(
  options: readonly FlatRow[],
  cursor: number,
  viewportRows: number,
): Window {
  const { start, end } = centeredWindow(options.length, cursor, viewportRows);
  if (start === 0) return { start, end, pinnedHeaderIndex: undefined };

  const headerIdx = ownerHeaderIndex(options, start);
  if (headerIdx === undefined || headerIdx === start)
    return { start, end, pinnedHeaderIndex: undefined };
  return { start, end, pinnedHeaderIndex: headerIdx };
}

const ID_COLUMN_MIN = 20;
const KIND_COLUMN_WIDTH = 12;

/** Widest `id` among the rows actually visible in this window — keeps columns aligned per-frame. */
function idColumnWidth(rows: readonly FlatRow[]): number {
  let widest = ID_COLUMN_MIN;
  for (const row of rows) {
    if (!isHeaderRow(row) && row.id) widest = Math.max(widest, row.id.length);
  }
  return widest;
}

/** Optional color hooks; identity by default so layout.ts stays ANSI-free for tests. */
export interface RowColorizer {
  cursor(mark: string, active: boolean): string;
  header(label: string): string;
  back(label: string, active: boolean): string;
  state(label: string, glyph: string): { glyph: string; label: string };
}

const NO_COLOR: RowColorizer = {
  cursor: mark => mark,
  header: label => label,
  back: label => label,
  state: (label, glyph) => ({ glyph, label }),
};

export interface RenderRowDeps {
  readonly cursor: number;
  readonly selected: ReadonlySet<string>;
  readonly idWidth: number;
  readonly colorize?: RowColorizer | undefined;
}

/** Formats one row. `deps.colorize` is optional — omit it for the plain, testable text. */
export function formatRow(row: FlatRow, index: number, deps: RenderRowDeps): string {
  const c = deps.colorize ?? NO_COLOR;
  if (isHeaderRow(row)) return c.header(row.label);

  const active = index === deps.cursor;
  if (row.kind === 'back') return c.back('← Back', active);

  const cursorMark = c.cursor(active ? '▸' : ' ', active);
  const box = deps.selected.has(row.value) ? '◼' : '◻';
  const id = (row.id ?? '').padEnd(deps.idWidth);
  const noun = (row.kindNoun ?? '').padEnd(KIND_COLUMN_WIDTH);
  const { glyph, label } = c.state(row.stateLabel ?? '', row.stateGlyph ?? '');
  return `${cursorMark} ${box} ${id} ${noun} ${glyph} ${label}`;
}

export interface BuildListRowsOptions {
  readonly cursor: number;
  readonly selected: ReadonlySet<string>;
  readonly viewportRows: number;
  readonly colorize?: RowColorizer | undefined;
}

/** Overwrites the window's first/last slot with scroll-affordance text; never changes row count. */
function applyScrollAffordances(
  rows: string[],
  options: readonly FlatRow[],
  window: Window,
  deps: RenderRowDeps,
): void {
  if (window.pinnedHeaderIndex !== undefined) {
    const pinned = options[window.pinnedHeaderIndex];
    if (pinned) {
      rows[0] = `${formatRow(pinned, window.pinnedHeaderIndex, deps)}  (↑ ${window.start} more above)`;
    }
  } else if (window.start > 0) {
    rows[0] = `↑ ${window.start} more`;
  }
  if (window.end < options.length) {
    rows[rows.length - 1] = `↓ ${options.length - window.end} more`;
  }
}

/**
 * Builds the visible list rows — ALWAYS exactly `viewportRows` entries once
 * `options.length >= viewportRows` (fewer only when the whole list is shorter than the viewport).
 * This length invariant, independent of `cursor` and of any row's `description`, is the property
 * that fixes the repaint bug; see the module header.
 */
export function buildListRows(options: readonly FlatRow[], opts: BuildListRowsOptions): string[] {
  if (options.length === 0) return [];
  const { cursor, selected, viewportRows, colorize } = opts;
  const window = computeWindow(options, cursor, viewportRows);
  const visible = options.slice(window.start, window.end);
  const idWidth = idColumnWidth(visible);
  const deps: RenderRowDeps = { cursor, selected, idWidth, colorize };

  const rows = visible.map((row, i) => formatRow(row, window.start + i, deps));
  applyScrollAffordances(rows, options, window, deps);
  return rows;
}

/** Greedily fills `lines` (mutated) up to `maxLines`, wrapping `words` at `width` columns. */
function fillWrappedLines(words: string[], width: number, maxLines: number, lines: string[]): void {
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > width && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) return;
    } else {
      current = candidate;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
}

/** Marks the last line with a trailing ellipsis when `text` had more content than fit. */
function markTruncated(lines: string[], text: string, maxLines: number): void {
  if (lines.length !== maxLines) return;
  const consumed =
    lines.slice(0, maxLines - 1).join(' ').length + (lines[maxLines - 1]?.length ?? 0);
  if (consumed >= text.length) return;
  const last = lines[maxLines - 1] ?? '';
  lines[maxLines - 1] = last.length > 1 ? `${last.slice(0, -1)}…` : `${last}…`;
}

/** Word-wraps `text` to `width` columns, hard-capped at `maxLines` with a trailing ellipsis. */
export function wrapDescription(text: string, width: number, maxLines: number): string[] {
  if (!text) return [];
  const lines: string[] = [];
  fillWrappedLines(text.split(/\s+/).filter(Boolean), width, maxLines, lines);
  markTruncated(lines, text, maxLines);
  return lines;
}
