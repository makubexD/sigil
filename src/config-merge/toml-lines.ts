/**
 * Line helpers for the TOML splice writer (./toml-file.ts).
 *
 * @module
 */

/** Splits `text` into lines, dropping the trailing empty line a trailing newline produces. */
export function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** The reverse of {@link splitLines}, restoring the trailing newline when the source had one. */
export function joinLines(lines: string[], trailingNewline: boolean): string {
  if (lines.length === 0) return '';
  return lines.join('\n') + (trailingNewline ? '\n' : '');
}

/** True when the line is whitespace only. */
export function isBlank(line: string): boolean {
  return line.trim() === '';
}

/** True when the line is a comment. */
export function isComment(line: string): boolean {
  return line.trim().startsWith('#');
}

/** True when the line starts a TOML table (or array-of-tables). */
export function isHeaderLine(line: string): boolean {
  return line.trim().startsWith('[');
}
