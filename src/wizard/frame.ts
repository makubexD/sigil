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
import {
  cancel as clackCancel,
  intro as clackIntro,
  log,
  note,
  outro as clackOutro,
} from '@clack/prompts';
import pc from 'picocolors';

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
  if (!insideHomeFrame()) clackIntro(title);
}

/** Closes the frame, or inside the home menu just prints the line and keeps the frame open. */
export function outro(message: string): void {
  if (insideHomeFrame()) log.step(message);
  else clackOutro(message);
}

/** A cancel message that closes the frame, or inside the home menu a warning that does not. */
export function cancel(message: string): void {
  if (insideHomeFrame()) log.warn(message);
  else clackCancel(message);
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

/** Prefixes every line with the gutter bar; an empty line becomes the bare bar. */
export function gutterLines(text: string): string {
  const bar = pc.gray('│');
  return text
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
