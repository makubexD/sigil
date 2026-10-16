/**
 * RFC 4180 CSV parser — turns CSV text into records of string fields.
 *
 * @module
 */

const QUOTE = '"';
const ESCAPED_QUOTE = '""';
const FIELD_SEPARATOR = ',';
const LF = '\n';
const CRLF = '\r\n';

interface Scanned<T> {
  readonly value: T;
  /** Offset just past the scanned text. */
  readonly end: number;
}

/**
 * Parses CSV text as described by RFC 4180.
 *
 * Fields are comma-separated and may be double-quoted; inside a quoted field `""` is a literal
 * quote, and commas and line breaks are kept verbatim. Records end with CRLF or LF, and a final
 * line break does not produce an empty record. A lone CR outside quotes is field content.
 *
 * @param text - The full CSV document.
 * @returns One array of fields per record; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is unterminated, or its closing quote is followed by
 *   anything other than a comma, a line break, or the end of input.
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
  for (;;) {
    const field = text[pos] === QUOTE ? readQuotedField(text, pos) : readUnquotedField(text, pos);
    fields.push(field.value);
    pos = field.end;
    if (text[pos] !== FIELD_SEPARATOR) {
      return { value: fields, end: pos + recordTerminatorLength(text, pos) };
    }
    pos += FIELD_SEPARATOR.length;
  }
}

function readUnquotedField(text: string, start: number): Scanned<string> {
  let end = start;
  while (end < text.length && !isFieldTerminator(text, end)) {
    end++;
  }
  return { value: text.slice(start, end), end };
}

function readQuotedField(text: string, start: number): Scanned<string> {
  let value = '';
  let pos = start + QUOTE.length;
  for (;;) {
    const quoteAt = text.indexOf(QUOTE, pos);
    if (quoteAt === -1) {
      throw new SyntaxError(`Unterminated quoted field starting at offset ${start}`);
    }
    value += text.slice(pos, quoteAt);
    if (!text.startsWith(ESCAPED_QUOTE, quoteAt)) {
      return { value, end: quoteAt + QUOTE.length };
    }
    value += QUOTE;
    pos = quoteAt + ESCAPED_QUOTE.length;
  }
}

function isFieldTerminator(text: string, pos: number): boolean {
  return text[pos] === FIELD_SEPARATOR || text[pos] === LF || text.startsWith(CRLF, pos);
}

/** Length of the line break at `pos` (0 at end of input); throws if there is none. */
function recordTerminatorLength(text: string, pos: number): number {
  if (pos === text.length) return 0;
  if (text[pos] === LF) return LF.length;
  if (text.startsWith(CRLF, pos)) return CRLF.length;
  throw new SyntaxError(`Unexpected character after closing quote at offset ${pos}`);
}
