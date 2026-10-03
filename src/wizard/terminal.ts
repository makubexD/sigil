/**
 * Fitting text to the terminal. clack draws its `│` gutter once per `\n`-separated line and redraws
 * a prompt by erasing a *logical* line count, so a line wider than the window (which the terminal
 * splits in two) loses its gutter, and a prompt line that wraps leaves leftovers behind when it is
 * redrawn. Everything the user sees therefore goes through these helpers first.
 *
 * Widths count visible columns: ANSI colour codes count as zero and are never split. Wide
 * (East Asian) characters count as one, which only ever errs on the side of an early wrap.
 *
 * @module
 */

/** Below this a window cannot show a useful line; text is laid out as if it were this wide. */
export const MIN_WIDTH = 20;

const ELLIPSIS = '…';
const ANSI_RESET = '\u001b[0m';
/** One ANSI colour sequence, or one visible character. */
// eslint-disable-next-line no-control-regex -- ESC starts the ANSI colour sequences kept whole
const CHUNK = /\u001b\[[0-9;]*m|[^\u001b]/gu;
const isEscape = (chunk: string): boolean => chunk.length > 1 && chunk.startsWith('\u001b');

/** How often an open prompt re-reads the window size; nothing else tells Node about a zoom on Windows. */
const WATCH_INTERVAL_MS = 200;

type SizedStream = NodeJS.WriteStream & { _refreshSize?: () => void };

/**
 * Re-reads the real window size into `process.stdout.columns` / `rows` and emits `resize` when it
 * changed. Node caches the size and, in ConPTY terminals on Windows (VS Code, Windows Terminal), is not
 * told about a resize or a zoom, so the cached number can be wider than the window. `_refreshSize` is
 * Node's own re-read; where it does not exist (a pipe, an old Node) the cached size is all there is.
 */
export function refreshWindowSize(): void {
  try {
    (process.stdout as SizedStream)._refreshSize?.();
  } catch {
    // keep the cached size
  }
}

/** A positive whole number from the environment, else `undefined`. */
function numberFromEnv(name: string): number | undefined {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

const positive = (value: unknown): number | undefined =>
  typeof value === 'number' && value > 0 ? value : undefined;

/**
 * The window width in columns, read live, or `undefined` when output is not a terminal (pipes, CI,
 * tests). `SIGIL_COLUMNS` overrides it for a terminal that reports the wrong size.
 */
export function terminalWidth(): number | undefined {
  const forced = numberFromEnv('SIGIL_COLUMNS');
  if (forced !== undefined) return forced;
  refreshWindowSize();
  return positive(process.stdout.columns);
}

/** The window height in rows, read live, or `undefined` when output is not a terminal. */
export function terminalHeight(): number | undefined {
  const forced = numberFromEnv('SIGIL_ROWS');
  if (forced !== undefined) return forced;
  refreshWindowSize();
  return positive(process.stdout.rows);
}

/**
 * While a prompt is open, re-reads the window size on a timer so the prompt follows a zoom or a
 * resize (clack re-renders on the `resize` this emits). Returns the function that stops it. Does
 * nothing without a terminal, and never keeps the process alive.
 */
export function watchWindowSize(): () => void {
  if (process.stdout.isTTY !== true) return () => {};
  const timer = setInterval(refreshWindowSize, WATCH_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}

/** One line for `SIGIL_DEBUG=terminal`: what Node cached, what the terminal really reports, any override. */
export function describeTerminal(): string {
  const size = (): string => `${process.stdout.columns ?? '?'}x${process.stdout.rows ?? '?'}`;
  const cached = size();
  refreshWindowSize();
  const forced = numberFromEnv('SIGIL_COLUMNS');
  return `terminal: cached ${cached}, live ${size()}, SIGIL_COLUMNS ${forced ?? 'not set'}`;
}

const chunksOf = (text: string): string[] => text.match(CHUNK) ?? [];

/** The columns `text` occupies on screen. */
export function visibleLength(text: string): number {
  return chunksOf(text).filter(chunk => !isEscape(chunk)).length;
}

/**
 * `text` cut to at most `max` columns, ending in `…` when something was dropped. Colour codes that
 * were kept are closed so a cut never bleeds into what follows. For one-line prompt text.
 */
export function fitLine(text: string, max: number): string {
  if (visibleLength(text) <= max) return text;
  if (max < 1) return '';
  const kept: string[] = [];
  let width = 0;
  let coloured = false;
  for (const chunk of chunksOf(text)) {
    if (isEscape(chunk)) {
      kept.push(chunk);
      coloured = true;
    } else if (width < max - 1) {
      kept.push(chunk);
      width += 1;
    }
  }
  return kept.join('') + (coloured ? ANSI_RESET : '') + ELLIPSIS;
}

/** A word is a run of non-space chunks. */
function wordsOf(chunks: string[]): string[][] {
  const words: string[][] = [];
  let current: string[] = [];
  for (const chunk of chunks) {
    if (chunk === ' ') {
      if (current.length > 0) words.push(current);
      current = [];
    } else {
      current.push(chunk);
    }
  }
  if (current.length > 0) words.push(current);
  return words;
}

const lengthOf = (chunks: string[]): number => chunks.filter(c => !isEscape(c)).length;

function lastSeparator(chunks: string[]): number {
  for (let i = chunks.length - 1; i >= 0; i -= 1) {
    if (chunks[i] === '/' || chunks[i] === '\\') return i;
  }
  return -1;
}

const HALF = 2;

/** Splits a word that cannot fit a whole line: after the last `/` or `\` in the second half, else hard. */
function splitLong(word: string[], room: number): [string[], string[]] {
  const cut = lastSeparator(word.slice(0, room));
  const at = cut + 1 >= room / HALF ? cut + 1 : room;
  return [word.slice(0, at), word.slice(at)];
}

/** The rows built so far for one source line, and the row being filled. */
interface Layout {
  rows: string[][];
  current: string[];
  width: number;
  /** Leading spaces of the source line, kept on every row. */
  base: number;
}

/** A row's indent, never more than half the width, so there is always room for text. */
const indentOf = (layout: Layout): number => Math.min(layout.base, Math.floor(layout.width / HALF));

function flush(layout: Layout): void {
  const indent = ' '.repeat(indentOf(layout));
  layout.rows.push([...indent, ...layout.current]);
  layout.current = [];
}

/** Columns left on the row being filled, after a separating space when it already holds text. */
const roomLeft = (layout: Layout): number =>
  layout.width - indentOf(layout) - lengthOf(layout.current) - (layout.current.length > 0 ? 1 : 0);

/** Adds a word to the layout, starting new rows and splitting it as needed. */
function place(layout: Layout, first: string[]): void {
  let word = first;
  while (lengthOf(word) > roomLeft(layout)) {
    if (layout.current.length > 0) {
      flush(layout);
    } else {
      const [head, tail] = splitLong(word, roomLeft(layout));
      layout.current = head;
      flush(layout);
      word = tail;
    }
  }
  if (word.length === 0) return;
  layout.current = layout.current.length > 0 ? [...layout.current, ' ', ...word] : word;
}

/** Wraps one source line (no `\n`) into rows no wider than `width`, each at the source line's indent. */
function wrapLine(line: string, width: number): string[] {
  if (visibleLength(line) <= width) return [line];
  const chunks = chunksOf(line);
  const base = Math.max(
    chunks.findIndex(chunk => chunk !== ' '),
    0,
  );
  const layout: Layout = { rows: [], current: [], width, base };
  for (const word of wordsOf(chunks)) place(layout, word);
  if (layout.current.length > 0) flush(layout);
  return layout.rows.length > 0 ? layout.rows.map(row => row.join('')) : [''];
}

/**
 * Wraps `text` so no line is wider than `width` (never below `MIN_WIDTH`). Each source line wraps at
 * spaces and keeps its own leading spaces on every row, so a wrapped line stays at the level of its
 * first row. A word wider than the line is split, after a path separator when there is one. Blank
 * lines are kept.
 */
export function wrapText(text: string, width: number): string {
  const limit = Math.max(width, MIN_WIDTH);
  return text
    .split('\n')
    .flatMap(line => wrapLine(line, limit))
    .join('\n');
}
