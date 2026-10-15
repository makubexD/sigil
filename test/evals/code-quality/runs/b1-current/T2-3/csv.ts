/**
 * RFC 4180 CSV parser.
 *
 * @module
 */

const QUOTE = '"';
const COMMA = ',';
const LF = '\n';
const CR = '\r';

interface Scanned<T> {
  readonly value: T;
  /** Offset just past the consumed input. */
  readonly end: number;
}

/**
 * Parses CSV text per RFC 4180.
 *
 * Fields are comma-separated and records end with CRLF or LF. A field may be wrapped in double
 * quotes, in which case it may contain commas and line breaks, and `""` stands for a literal `"`.
 * A final line break does not produce an extra empty record, but a blank line before it does
 * (as a record with one empty field). A quote or bare CR inside an unquoted field is kept as data.
 *
 * @param text - The full CSV document.
 * @returns One array of field values per record; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is unterminated, or a closing quote is followed by
 *   anything other than a comma, line break, or end of input (e.g. `"a"b`).
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let pos = 0;
  while (pos < text.length) {
    const record = readRecord(text, pos);
    records.push(record.value);
    pos = record.end;
  }
  return records;
}

function readRecord(text: string, start: number): Scanned<string[]> {
  const fields: string[] = [];
  let pos = start;
  while (true) {
    const field = readField(text, pos);
    fields.push(field.value);
    pos = field.end;
    if (text[pos] !== COMMA) break;
    pos++;
  }
  return { value: fields, end: pos + lineBreakLength(text, pos) };
}

function readField(text: string, start: number): Scanned<string> {
  return text[start] === QUOTE ? readQuotedField(text, start) : readUnquotedField(text, start);
}

function readUnquotedField(text: string, start: number): Scanned<string> {
  let pos = start;
  while (pos < text.length && !isFieldTerminator(text, pos)) pos++;
  return { value: text.slice(start, pos), end: pos };
}

function readQuotedField(text: string, start: number): Scanned<string> {
  let value = '';
  let pos = start + 1;
  while (true) {
    const quotePos = text.indexOf(QUOTE, pos);
    if (quotePos === -1) {
      throw new SyntaxError(`Unterminated quoted field starting at offset ${start}`);
    }
    value += text.slice(pos, quotePos);
    pos = quotePos + 1;
    if (text[pos] !== QUOTE) break;
    value += QUOTE;
    pos++;
  }
  if (pos < text.length && !isFieldTerminator(text, pos)) {
    throw new SyntaxError(`Unexpected character after closing quote at offset ${pos}`);
  }
  return { value, end: pos };
}

function isFieldTerminator(text: string, pos: number): boolean {
  return text[pos] === COMMA || lineBreakLength(text, pos) > 0;
}

/** Length of the CRLF or LF at `pos`, or 0 if there is none (a bare CR is not a line break). */
function lineBreakLength(text: string, pos: number): number {
  if (text[pos] === LF) return 1;
  if (text[pos] === CR && text[pos + 1] === LF) return 2;
  return 0;
}
