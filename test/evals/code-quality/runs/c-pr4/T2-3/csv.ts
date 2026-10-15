/**
 * RFC 4180 CSV parser — turns CSV text into rows of string fields.
 *
 * @module
 */

const QUOTE = '"';
const COMMA = ',';
const CRLF = '\r\n';
const LF = '\n';

/** Read position within the CSV text; `pos` advances as fields are consumed. */
interface Cursor {
  readonly text: string;
  pos: number;
}

/**
 * Parses CSV text as described by RFC 4180.
 *
 * Fields are comma-separated and may be double-quoted; inside a quoted field `""` is a literal
 * quote, and commas and line breaks are kept verbatim. Records end with CRLF or LF, and a final
 * line break does not produce an empty record. Unquoted fields are taken literally, including
 * any stray `"` or lone CR characters.
 *
 * @param text - The full CSV document.
 * @returns One array of fields per record; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is unterminated, or its closing quote is followed by
 *   anything other than a comma, a line break, or the end of input.
 */
export function parseCsv(text: string): string[][] {
  const cursor: Cursor = { text, pos: 0 };
  const records: string[][] = [];
  while (cursor.pos < text.length) {
    records.push(readRecord(cursor));
  }
  return records;
}

function readRecord(cursor: Cursor): string[] {
  const fields = [readField(cursor)];
  while (cursor.text[cursor.pos] === COMMA) {
    cursor.pos += COMMA.length;
    fields.push(readField(cursor));
  }
  cursor.pos += lineBreakLength(cursor);
  return fields;
}

function readField(cursor: Cursor): string {
  if (cursor.text[cursor.pos] !== QUOTE) {
    return readUnquotedField(cursor);
  }
  const value = readQuotedField(cursor);
  if (!isAtFieldEnd(cursor)) {
    throw new SyntaxError(`Unexpected character after closing quote at offset ${cursor.pos}`);
  }
  return value;
}

function readUnquotedField(cursor: Cursor): string {
  const start = cursor.pos;
  while (!isAtFieldEnd(cursor)) {
    cursor.pos++;
  }
  return cursor.text.slice(start, cursor.pos);
}

function readQuotedField(cursor: Cursor): string {
  const openingOffset = cursor.pos;
  cursor.pos += QUOTE.length;
  let value = '';
  for (;;) {
    const closingOffset = cursor.text.indexOf(QUOTE, cursor.pos);
    if (closingOffset === -1) {
      throw new SyntaxError(`Unterminated quoted field starting at offset ${openingOffset}`);
    }
    value += cursor.text.slice(cursor.pos, closingOffset);
    cursor.pos = closingOffset + QUOTE.length;
    if (!cursor.text.startsWith(QUOTE, cursor.pos)) {
      return value;
    }
    value += QUOTE;
    cursor.pos += QUOTE.length;
  }
}

function isAtFieldEnd(cursor: Cursor): boolean {
  return (
    cursor.pos >= cursor.text.length ||
    cursor.text[cursor.pos] === COMMA ||
    lineBreakLength(cursor) > 0
  );
}

/** Length of the record terminator at the cursor, or 0 if there is none. */
function lineBreakLength(cursor: Cursor): number {
  if (cursor.text.startsWith(CRLF, cursor.pos)) return CRLF.length;
  if (cursor.text.startsWith(LF, cursor.pos)) return LF.length;
  return 0;
}
