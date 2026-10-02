/**
 * One continuous terminal frame for the home menu. clack's `intro` opens a frame (`┌`), and `outro` /
 * `cancel` close it (`└`). A wizard run from the menu must not open or close a second one inside the
 * first, and the plain `console.log` output of the commands it runs must stay inside the `│` gutter.
 *
 * Outside the menu nothing changes: every function here calls clack exactly as before, so `sigil add`
 * and friends print the same bytes they always did.
 *
 * @module
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { format } from 'node:util';
import { cancel as clackCancel, intro as clackIntro, outro as clackOutro } from '@clack/prompts';
import pc from 'picocolors';
import { log, note } from './say';
import { fitLine, terminalWidth, wrapText } from './terminal';

/** The gutter bar and its two spaces, plus one spare column. */
const GUTTER_WIDTH = 4;

/** A one-line message cut to the window, for the frame's own `┌` / `└` lines. */
const oneLine = (text: string): string => {
  const width = terminalWidth();
  return width === undefined ? text : fitLine(text, width - GUTTER_WIDTH);
};

interface HomeFrame {
  /** Notes already shown in this session, so a second install does not repeat "How this works". */
  shownNotes: Set<string>;
}

const frames = new AsyncLocalStorage<HomeFrame>();

/** Runs `fn` as the body of the home menu's single frame. */
export function runInHomeFrame<T>(fn: () => Promise<T>): Promise<T> {
  return frames.run({ shownNotes: new Set() }, fn);
}

/** True while the home menu owns the frame. */
export const insideHomeFrame = (): boolean => frames.getStore() !== undefined;

/** Opens a frame, unless the home menu already did. */
export function intro(title: string): void {
  if (!insideHomeFrame()) clackIntro(oneLine(title));
}

/** Closes the frame, or inside the home menu just prints the line and keeps the frame open. */
export function outro(message: string): void {
  if (insideHomeFrame()) log.step(message);
  else clackOutro(oneLine(message));
}

/** A cancel message that closes the frame, or inside the home menu a warning that does not. */
export function cancel(message: string): void {
  if (insideHomeFrame()) log.warn(message);
  else clackCancel(oneLine(message));
}

/** A note, shown once per home session when `key` is given a second time. */
export function noteOnce(key: string, body: string, title: string): void {
  const store = frames.getStore();
  if (store?.shownNotes.has(key)) return;
  store?.shownNotes.add(key);
  note(body, title);
}

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error';
const CONSOLE_METHODS: readonly ConsoleMethod[] = ['log', 'info', 'warn', 'error'];

/**
 * Wraps `text` to the window and prefixes every line with the gutter bar, so a wrapped line keeps
 * it. An empty line becomes the bare bar. `width` defaults to the window's; no window means no wrap.
 */
export function gutterLines(text: string, width = terminalWidth()): string {
  const bar = pc.gray('│');
  const fitted = width === undefined ? text : wrapText(text, width - GUTTER_WIDTH);
  return fitted
    .split('\n')
    .map(line => (line.trim() === '' ? bar : `${bar}  ${line}`))
    .join('\n');
}

/**
 * Runs `fn` with `console.log/info/warn/error` drawn inside the `│` gutter, then restores them,
 * even when `fn` throws. Only the home menu uses it: it is how a verb's plain output lines up with
 * the prompts around it without rewriting every verb.
 */
export async function withGutter<T>(fn: () => Promise<T>): Promise<T> {
  if (!insideHomeFrame()) return fn();
  const originals = new Map(CONSOLE_METHODS.map(name => [name, console[name]] as const));
  for (const name of CONSOLE_METHODS) {
    const write = originals.get(name)!;
    console[name] = (...args: unknown[]) => write(gutterLines(format(...args)));
  }
  try {
    return await fn();
  } finally {
    for (const name of CONSOLE_METHODS) console[name] = originals.get(name)!;
  }
}

/**
 * Prints `text` as given, never wrapped and without the `│` bar: for a command the user will copy.
 * The caller indents it with spaces to the text column, so a selection holds the command and
 * nothing else (the bar would be copied, and `│` is an error in every shell).
 */
export function copyableLine(text: string): void {
  process.stdout.write(`${text}\n`);
}
