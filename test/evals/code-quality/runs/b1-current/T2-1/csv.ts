/**
 * RFC 4180 CSV parsing.
 *
 * @module
 */

const QUOTE = '"';
const COMMA = ',';
const LF = '\n';
const CRLF = '\r\n';

/** Read position into the text being parsed; advanced by each reader. */
interface Cursor {
  readonly text: string;
  pos: number;
}

/**
 * Parses CSV text per RFC 4180.
 *
 * Fields are separated by commas and records end with CRLF or LF. A field may be enclosed in
 * double quotes, in which case it may contain commas, line breaks, and `""` (a literal quote).
 * A line break at the very end of the input does not produce an empty record.
 *
 * Lenient where RFC 4180 is silent: a lone CR and a `"` inside an unquoted field are kept as
 * ordinary field data, and records may have differing field counts.
 *
 * @param text - The full CSV document.
 * @returns One array of field values per record; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is never closed, or a closing quote is followed by
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
  const fields: string[] = [];
  for (;;) {
    fields.push(readField(cursor));
    if (cursor.pos >= cursor.text.length) return fields;
    if (consume(cursor, COMMA)) continue;
    if (consume(cursor, LF) || consume(cursor, CRLF)) return fields;
    // Only a quoted field can stop short of a delimiter, so this is text after its closing quote.
    throw new SyntaxError(`Unexpected character after closing quote at offset ${cursor.pos}`);
  }
}

function readField(cursor: Cursor): string {
  return cursor.text.startsWith(QUOTE, cursor.pos) ? readQuotedField(cursor) : readUnquotedField(cursor);
}

function readQuotedField(cursor: Cursor): string {
  const start = cursor.pos;
  cursor.pos += QUOTE.length;
  let value = '';
  for (;;) {
    const close = cursor.text.indexOf(QUOTE, cursor.pos);
    if (close === -1) {
      throw new SyntaxError(`Unterminated quoted field starting at offset ${start}`);
    }
    value += cursor.text.slice(cursor.pos, close);
    cursor.pos = close + QUOTE.length;
    if (!consume(cursor, QUOTE)) return value;
    value += QUOTE;
  }
}

function readUnquotedField(cursor: Cursor): string {
  const { text } = cursor;
  let end = cursor.pos;
  while (end < text.length && !isFieldEnd(text, end)) {
    end++;
  }
  const value = text.slice(cursor.pos, end);
  cursor.pos = end;
  return value;
}

function isFieldEnd(text: string, index: number): boolean {
  return text.startsWith(COMMA, index) || text.startsWith(LF, index) || text.startsWith(CRLF, index);
}

/** Advances past `token` if it occurs at the cursor; reports whether it did. */
function consume(cursor: Cursor, token: string): boolean {
  if (!cursor.text.startsWith(token, cursor.pos)) return false;
  cursor.pos += token.length;
  return true;
}
