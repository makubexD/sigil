/**
 * RFC 4180 CSV parser — turns CSV text into records of string fields.
 *
 * @module
 */

const QUOTE = '"';
const COMMA = ",";
const LF = "\n";
const CRLF = "\r\n";

interface Cursor {
  readonly text: string;
  pos: number;
}

/**
 * Parses CSV text into records following RFC 4180.
 *
 * Fields are comma-separated and may be double-quoted; inside a quoted field `""` is a literal
 * quote, and commas and line breaks are kept verbatim. Records end with CRLF or LF. A final line
 * break does not produce an empty record. A lone CR outside a quoted field is treated as data.
 *
 * @param text - The full CSV document.
 * @returns One array of fields per record, in input order; `[]` for empty input.
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
  const fields = [readField(cursor)];
  while (cursor.text.startsWith(COMMA, cursor.pos)) {
    cursor.pos += COMMA.length;
    fields.push(readField(cursor));
  }
  cursor.pos += lineBreakLength(cursor);
  return fields;
}

function readField(cursor: Cursor): string {
  if (!cursor.text.startsWith(QUOTE, cursor.pos)) {
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
    cursor.pos += 1;
  }
  return cursor.text.slice(start, cursor.pos);
}

/** Reads from an opening quote through its matching closing quote, unescaping `""`. */
function readQuotedField(cursor: Cursor): string {
  const openedAt = cursor.pos;
  cursor.pos += QUOTE.length;
  let value = "";
  for (;;) {
    const quoteAt = cursor.text.indexOf(QUOTE, cursor.pos);
    if (quoteAt === -1) {
      throw new SyntaxError(`Unterminated quoted field starting at offset ${openedAt}`);
    }
    value += cursor.text.slice(cursor.pos, quoteAt);
    cursor.pos = quoteAt + QUOTE.length;
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
    cursor.text.startsWith(COMMA, cursor.pos) ||
    lineBreakLength(cursor) > 0
  );
}

/** Length of the line break at the cursor, or 0 when there is none. */
function lineBreakLength(cursor: Cursor): number {
  if (cursor.text.startsWith(CRLF, cursor.pos)) return CRLF.length;
  if (cursor.text.startsWith(LF, cursor.pos)) return LF.length;
  return 0;
}
