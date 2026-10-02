/**
 * `log` and `note` that fit the terminal. clack draws the gutter once per line and sizes a note box
 * from its longest line, but never wraps, so a long line is split by the terminal into a
 * continuation with no gutter (or a note box with a broken edge). These wrap first, at the width
 * the window has right now, so a zoom or a resize applies to the next thing printed.
 *
 * With no terminal (pipes, CI, tests) the text passes through untouched.
 *
 * @module
 */
import { log as clackLog, note as clackNote } from '@clack/prompts';
import type { LogMessageOptions } from '@clack/prompts';
import { fitLine, terminalWidth, wrapText } from './terminal';

/** The gutter bar, the symbol and their two spaces, plus one spare column. */
const LOG_MARGIN = 4;
/** A note's `│  ` on the left and `  │` on the right, the gutter, plus a spare column. */
const NOTE_MARGIN = 8;

function fitted(text: string, margin: number): string {
  const width = terminalWidth();
  return width === undefined ? text : wrapText(text, width - margin);
}

const line =
  (write: (message: string) => void) =>
  (message: string): void =>
    write(fitted(message, LOG_MARGIN));

export const log = {
  message: (message = '', opts?: LogMessageOptions): void =>
    clackLog.message(fitted(message, LOG_MARGIN), opts),
  info: line(message => clackLog.info(message)),
  success: line(message => clackLog.success(message)),
  step: line(message => clackLog.step(message)),
  warn: line(message => clackLog.warn(message)),
  error: line(message => clackLog.error(message)),
};

/** A boxed note whose body is wrapped, and whose title is cut, to fit inside the window. */
export function note(body = '', title = ''): void {
  const width = terminalWidth();
  const titleFits = width === undefined ? title : fitLine(title, width - NOTE_MARGIN);
  clackNote(fitted(body, NOTE_MARGIN), titleFits);
}
