/**
 * RFC 4180 CSV parser: turns CSV text into records of string fields.
 *
 * @module
 */

const QUOTE = '"';
const COMMA = ",";
const CR = "\r";
const LF = "\n";

interface Cursor {
  readonly text: string;
  pos: number;
}

/**
 * Parses CSV text as described by RFC 4180.
 *
 * Fields are comma-separated and may be double-quoted; inside a quoted field `""` is a literal
 * quote, and commas and line breaks are kept verbatim. Records end with CRLF or LF, and a final
 * line break does not produce an extra empty record. A lone CR outside quotes is field data.
 *
 * @param text - The CSV document.
 * @returns One array of fields per record; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is unterminated, or a closing quote is followed by
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
    if (cursor.text[cursor.pos] === COMMA) {
      cursor.pos++;
      continue;
    }
    const lineBreakLength = lineBreakLengthAt(cursor);
    if (lineBreakLength === 0) {
      throw new SyntaxError(`Unexpected character after closing quote at index ${cursor.pos}`);
    }
    cursor.pos += lineBreakLength;
    return fields;
  }
}

function readField(cursor: Cursor): string {
  return cursor.text[cursor.pos] === QUOTE ? readQuotedField(cursor) : readUnquotedField(cursor);
}

function readUnquotedField(cursor: Cursor): string {
  const start = cursor.pos;
  while (
    cursor.pos < cursor.text.length &&
    cursor.text[cursor.pos] !== COMMA &&
    lineBreakLengthAt(cursor) === 0
  ) {
    cursor.pos++;
  }
  return cursor.text.slice(start, cursor.pos);
}

function readQuotedField(cursor: Cursor): string {
  const openingQuotePos = cursor.pos;
  cursor.pos++;
  let value = "";
  for (;;) {
    const quotePos = cursor.text.indexOf(QUOTE, cursor.pos);
    if (quotePos === -1) {
      throw new SyntaxError(`Unterminated quoted field starting at index ${openingQuotePos}`);
    }
    value += cursor.text.slice(cursor.pos, quotePos);
    cursor.pos = quotePos + 1;
    if (cursor.text[cursor.pos] !== QUOTE) return value;
    value += QUOTE;
    cursor.pos++;
  }
}

/** Length of the record terminator (LF or CRLF) at the cursor, or 0 if there is none. */
function lineBreakLengthAt(cursor: Cursor): number {
  const { text, pos } = cursor;
  if (text[pos] === LF) return LF.length;
  if (text[pos] === CR && text[pos + 1] === LF) return CR.length + LF.length;
  return 0;
}
