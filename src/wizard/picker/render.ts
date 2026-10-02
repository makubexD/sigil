/**
 * Assembles the colored frame string for `pickArtifacts` from the pure layout in layout.ts.
 * Kept separate from layout.ts so the row-count invariant (the actual bug fix) stays testable
 * without needing a TTY, ANSI stripping, or picocolors' color-support detection.
 *
 * @module
 */
import pc from 'picocolors';
import {
  buildListRows,
  computeViewportRows,
  computeWindow,
  isHeaderRow,
  wrapDescription,
  type FlatRow,
  type RowColorizer,
} from './layout';

const DETAIL_LINES = 3;
const DESC_INDENT = 3;
const DESC_MIN_WIDTH = 20;
const SEPARATOR_MAX_WIDTH = 60;
const DESC_INDENT_TOTAL = DESC_INDENT + DESC_INDENT; // left bar-indent + right margin

const COLORIZE: RowColorizer = {
  cursor: (mark, active) => (active ? pc.cyan(mark) : mark),
  header: label => pc.bold(label),
  back: (label, active) => (active ? pc.cyan(label) : pc.dim(label)),
  state: (label, glyph) => {
    switch (label) {
      case 'installed':
        return { glyph: pc.dim(glyph), label: pc.dim(label) };
      case 'update available':
      case 'missing from disk':
        return { glyph: pc.cyan(glyph), label: pc.cyan(label) };
      case 'you edited this':
        return { glyph: pc.yellow(glyph), label: pc.yellow(label) };
      case "not sigil's":
        return { glyph: pc.yellow(glyph), label: pc.yellow(label) };
      default:
        return { glyph: pc.green(glyph), label: pc.green(label) };
    }
  },
};

function buildDetailPane(row: FlatRow | undefined, columns: number): string[] {
  const bar = pc.gray('│');
  if (!row || isHeaderRow(row) || row.kind === 'back') {
    return [bar, bar, bar, bar];
  }
  const { glyph, label } = COLORIZE.state(row.stateLabel ?? '', row.stateGlyph ?? '');
  const headerLine = `${bar}  ${pc.bold(row.id ?? '')} · ${row.kindNoun ?? ''} · ${glyph} ${label}`;
  const wrapped = wrapDescription(
    row.description ?? '',
    Math.max(columns - DESC_INDENT_TOTAL, DESC_MIN_WIDTH),
    DETAIL_LINES,
  );
  const descLines = Array.from(
    { length: DETAIL_LINES },
    (_, i) => `${bar}  ${pc.dim(wrapped[i] ?? '')}`,
  );
  return [headerLine, ...descLines];
}

export interface RenderFrameOptions {
  readonly message: string;
  readonly options: readonly FlatRow[];
  readonly cursor: number;
  readonly selected: ReadonlySet<string>;
  readonly terminalRows: number;
  readonly terminalColumns: number;
  readonly footerHint: string;
  /** clack prompt state; only `active` draws the list. */
  readonly state?: string;
}

/** What stays on screen once the prompt is answered or cancelled: one line, like clack's own prompts. */
function settledFrame(opts: RenderFrameOptions): string | undefined {
  const bar = pc.gray('│');
  if (opts.state === 'submit') {
    const picked = pc.dim(`${opts.selected.size} picked`);
    return [bar, `${pc.green('◇')}  ${opts.message}`, `${bar}  ${picked}`].join('\n');
  }
  if (opts.state === 'cancel') return [bar, `${pc.red('■')}  ${opts.message}`].join('\n');
  return undefined;
}

/** Builds the full multi-line frame string rendered on every keystroke. */
export function renderFrame(opts: RenderFrameOptions): string {
  const settled = settledFrame(opts);
  if (settled !== undefined) return settled;
  const { message, options, cursor, selected, terminalRows, terminalColumns, footerHint } = opts;
  const bar = pc.gray('│');
  const viewportRows = computeViewportRows(terminalRows, options.length);
  const listRows = buildListRows(options, { cursor, selected, viewportRows, colorize: COLORIZE });
  const listLines = listRows.map(row => `${bar}  ${row}`);

  const pickedCount = selected.size;
  const position = pc.dim(`${cursor + 1} of ${options.length} · ${pickedCount} picked`);
  const header = `${pc.cyan('◆')}  ${message}            ${position}`;
  const separator = pc.gray('─'.repeat(Math.min(terminalColumns, SEPARATOR_MAX_WIDTH)));
  const window = computeWindow(options, cursor, viewportRows);
  const detail = buildDetailPane(options[cursor] ?? options[window.start], terminalColumns);
  const footer = `${pc.gray('└')}  ${pc.dim(footerHint)}`;

  return [bar, header, ...listLines, `${bar}${separator}`, ...detail, footer].join('\n');
}
