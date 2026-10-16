/**
 * RFC 4180 CSV parser: turns CSV text into rows of string fields.
 *
 * @module
 */

const QUOTE = '"';
const COMMA = ',';
const LF = '\n';
const CRLF = '\r\n';

/** Read position into the CSV text, advanced by the helpers as they consume input. */
interface Cursor {
  readonly text: string;
  pos: number;
}

/**
 * Parses CSV text as described by RFC 4180.
 *
 * Fields are comma-separated and may be double-quoted; inside a quoted field `""` is a literal
 * quote, and commas and line breaks are kept verbatim. Records end with CRLF or LF, and a final
 * line break does not produce an empty trailing record. A lone CR is treated as field data.
 *
 * @param text - CSV content.
 * @returns One array of fields per record; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is unterminated, or if anything other than a comma,
 *   line break, or end of input follows a closing quote.
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
    cursor.pos++;
    fields.push(readField(cursor));
  }
  consumeLineBreak(cursor);
  return fields;
}

function readField(cursor: Cursor): string {
  return cursor.text[cursor.pos] === QUOTE ? readQuotedField(cursor) : readUnquotedField(cursor);
}

function readUnquotedField(cursor: Cursor): string {
  const start = cursor.pos;
  while (!isAtFieldEnd(cursor)) {
    cursor.pos++;
  }
  return cursor.text.slice(start, cursor.pos);
}

function readQuotedField(cursor: Cursor): string {
  const openingQuotePos = cursor.pos;
  cursor.pos++;
  let value = '';
  for (;;) {
    const quotePos = cursor.text.indexOf(QUOTE, cursor.pos);
    if (quotePos === -1) {
      throw new SyntaxError(`Unterminated quoted field starting at offset ${openingQuotePos}`);
    }
    value += cursor.text.slice(cursor.pos, quotePos);
    cursor.pos = quotePos + 1;
    if (cursor.text[cursor.pos] !== QUOTE) break;
    value += QUOTE;
    cursor.pos++;
  }
  if (!isAtFieldEnd(cursor)) {
    throw new SyntaxError(`Unexpected character after closing quote at offset ${cursor.pos}`);
  }
  return value;
}

function isAtFieldEnd(cursor: Cursor): boolean {
  const { text, pos } = cursor;
  return pos >= text.length || text[pos] === COMMA || text[pos] === LF || text.startsWith(CRLF, pos);
}

function consumeLineBreak(cursor: Cursor): void {
  if (cursor.text.startsWith(CRLF, cursor.pos)) {
    cursor.pos += CRLF.length;
  } else if (cursor.text[cursor.pos] === LF) {
    cursor.pos += LF.length;
  }
}
