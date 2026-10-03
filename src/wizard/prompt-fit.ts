/**
 * What every prompt shares: its option types, the symbols it draws with, and the cutting of lines to
 * the window. A prompt line is cut, not wrapped: clack redraws a prompt by erasing a logical line
 * count, so a line the terminal splits in two leaves leftovers behind (the overlapping text on a
 * small or zoomed-in window). The window is read when a prompt is drawn, so it follows a zoom.
 *
 * With no terminal (pipes, CI, tests) nothing is cut.
 *
 * @module
 */
import pc from 'picocolors';
import { MIN_WIDTH, fitLine, terminalHeight, terminalWidth, visibleLength } from './terminal';

/** One thing to choose. `label` defaults to the value, `hint` is shown next to the active row. */
export interface Choice<Value> {
  value: Value;
  label?: string;
  hint?: string;
}

export interface SelectOptions<Value> {
  message: string;
  options: Array<Choice<Value>>;
  initialValue?: Value;
  /** Most rows shown at once; the window height can lower it further. */
  maxItems?: number;
}

export interface MultiSelectOptions<Value> {
  message: string;
  options: Array<Choice<Value>>;
  initialValues?: Value[];
  maxItems?: number;
  /** Defaults to true, like clack's: an empty answer is refused. */
  required?: boolean;
  cursorAt?: Value;
}

export interface ConfirmOptions {
  message: string;
  active?: string;
  inactive?: string;
  initialValue?: boolean;
}

export interface TextOptions {
  message: string;
  placeholder?: string;
  defaultValue?: string;
  initialValue?: string;
  validate?: (value: string) => string | void;
}

export type PromptState = 'initial' | 'active' | 'cancel' | 'submit' | 'error';

/** clack's own test for a terminal that draws box characters; the rest get plain ASCII. */
function supportsUnicode(): boolean {
  const { env, platform } = process;
  if (platform !== 'win32') return env['TERM'] !== 'linux';
  return Boolean(
    env['CI'] ||
    env['WT_SESSION'] ||
    env['TERMINUS_SUBLIME'] ||
    env['ConEmuTask'] === '{cmd::Cmder}' ||
    env['TERM_PROGRAM'] === 'Terminus-Sublime' ||
    env['TERM_PROGRAM'] === 'vscode' ||
    env['TERM'] === 'xterm-256color' ||
    env['TERM'] === 'alacritty' ||
    env['TERMINAL_EMULATOR'] === 'JetBrains-JediTerm',
  );
}

const glyph = (unicode: string, ascii: string): string => (supportsUnicode() ? unicode : ascii);

/** The symbols prompts are drawn with; read per call so a changed terminal is honoured. */
export const symbols = {
  bar: () => glyph('│', '|'),
  end: () => glyph('└', '—'),
  dot: () => glyph('●', '>'),
  circle: () => glyph('○', ' '),
  box: () => glyph('◻', '[ ]'),
  boxOn: () => glyph('◼', '[+]'),
  more: () => '...',
};

function stateSymbol(state: PromptState): string {
  if (state === 'cancel') return pc.red(glyph('■', 'x'));
  if (state === 'error') return pc.yellow(glyph('▲', 'x'));
  if (state === 'submit') return pc.green(glyph('◇', 'o'));
  return pc.cyan(glyph('◆', '*'));
}

/** The spacer line and the question line every prompt starts with; the question is cut to the window. */
export function head(state: PromptState, message: string): string {
  const width = terminalWidth();
  const text = width === undefined ? message : fitLine(message, width - MESSAGE_MARGIN);
  return `${pc.gray(symbols.bar())}\n${stateSymbol(state)}  ${text}\n`;
}

/** The `◆`, its two spaces and one spare column. */
const MESSAGE_MARGIN = 4;
/** The gutter, the marker and their spaces, plus one spare column. */
const OPTION_MARGIN = 8;
/** The ` (` and `)` clack puts around a hint. */
const HINT_FRAME = 3;
/** A hint shorter than this is not worth showing next to a label that fills the line. */
const MIN_HINT = 4;
/** The marker the menu puts on its top suggestion; a narrow window must not cut it off. */
const RECOMMENDED = ' (recommended)';
/** Rows kept free for the question, the frame and an error, so a tall list never scrolls the frame. */
const RESERVED_ROWS = 6;
const MIN_VISIBLE = 3;

/** A label cut to `max` columns; a trailing "(recommended)" is kept and the words before it give way. */
function fitLabel(label: string, max: number): string {
  if (!label.endsWith(RECOMMENDED) || max <= RECOMMENDED.length + MIN_HINT) {
    return fitLine(label, max);
  }
  return fitLine(label.slice(0, -RECOMMENDED.length), max - RECOMMENDED.length) + RECOMMENDED;
}

/** One option cut to `max` columns as clack shows it, `label (hint)`: the hint gives way first. */
export function fitRow<Row extends Choice<unknown>>(row: Row, max: number): Row {
  const label = row.label ?? String(row.value);
  const hint = row.hint ?? '';
  const total = visibleLength(label) + (hint ? HINT_FRAME + visibleLength(hint) : 0);
  if (total <= max) return row;
  const room = max - visibleLength(label) - HINT_FRAME;
  if (hint && room >= MIN_HINT) return { ...row, hint: fitLine(hint, room) };
  const { hint: _dropped, ...rest } = row;
  return { ...rest, label: fitLabel(label, max) } as Row;
}

/** The options as they are shown in this window. */
export function fitRows<Row extends Choice<unknown>>(rows: Row[], width = terminalWidth()): Row[] {
  if (width === undefined) return rows;
  return rows.map(row => fitRow(row, width - OPTION_MARGIN));
}

/**
 * A prompt's message and options as a person sees them in this window. The renderers use the same
 * cuts, and the test mock records this, so a test sees what the user would.
 */
export function fitView<View extends { message: string; options?: Array<Choice<unknown>> }>(
  view: View,
  width = terminalWidth(),
): View {
  if (width === undefined) return view;
  const message = fitLine(view.message, width - MESSAGE_MARGIN);
  return view.options
    ? { ...view, message, options: fitRows(view.options, width) }
    : { ...view, message };
}

/** Every line of `frame` cut to one column short of the window, so the terminal never splits one. */
export function cutFrame(frame: string, width = terminalWidth()): string {
  if (width === undefined) return frame;
  const max = Math.max(width, MIN_WIDTH) - 1;
  return frame
    .split('\n')
    .map(line => fitLine(line, max))
    .join('\n');
}

/**
 * The rows of `items` to show, styled, with the cursor kept in view and `...` where more are hidden.
 * The window follows the terminal height, so a long list never grows past the screen.
 */
export function visibleItems<Item>(
  items: Item[],
  cursor: number,
  style: (item: Item, active: boolean) => string,
  maxItems = Infinity,
): string[] {
  const rows = terminalHeight();
  const byHeight = rows === undefined ? Infinity : Math.max(rows - RESERVED_ROWS, MIN_VISIBLE);
  const size = Math.min(byHeight, Math.max(maxItems, MIN_VISIBLE));
  const start = windowStart(items.length, cursor, size);
  const hiddenAbove = size < items.length && start > 0;
  const hiddenBelow = size < items.length && start + size < items.length;
  return items.slice(start, start + size).map((item, i, shown) => {
    const edge = (i === 0 && hiddenAbove) || (i === shown.length - 1 && hiddenBelow);
    return edge ? pc.dim(symbols.more()) : style(item, start + i === cursor);
  });
}

const SCROLL_MARGIN = 3;

/** First visible index: the cursor stays a few rows from either edge. */
function windowStart(count: number, cursor: number, size: number): number {
  if (cursor >= size - SCROLL_MARGIN) {
    return Math.max(Math.min(cursor - size + SCROLL_MARGIN, count - size), 0);
  }
  return 0;
}
