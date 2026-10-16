/**
 * RFC 4180 CSV parser — turns CSV text into records of string fields.
 *
 * @module
 */

const COMMA = ",";
const QUOTE = '"';
const CR = "\r";
const LF = "\n";

/** Read position within the text being parsed; advanced by each reader. */
interface Cursor {
  readonly text: string;
  pos: number;
}

/**
 * Parses CSV text as specified by RFC 4180.
 *
 * Fields are comma-separated and may be enclosed in double quotes; inside a quoted field `""`
 * is a literal quote, and commas and line breaks are kept verbatim. Records end with CRLF or
 * LF, and a final line break does not produce an empty record. A lone CR outside a quoted
 * field is treated as field data. Quotes inside an unquoted field are kept literally.
 *
 * @param text - The full CSV document.
 * @returns One array of fields per record, in input order; `[]` for empty input.
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
  cursor.pos += lineBreakLength(cursor.text, cursor.pos);
  return fields;
}

function readField(cursor: Cursor): string {
  return cursor.text[cursor.pos] === QUOTE ? readQuotedField(cursor) : readUnquotedField(cursor);
}

function readUnquotedField(cursor: Cursor): string {
  const start = cursor.pos;
  while (!isFieldEnd(cursor.text, cursor.pos)) {
    cursor.pos++;
  }
  return cursor.text.slice(start, cursor.pos);
}

function readQuotedField(cursor: Cursor): string {
  const { text } = cursor;
  const openingQuotePos = cursor.pos;
  cursor.pos += QUOTE.length;
  let value = "";
  for (;;) {
    const quotePos = text.indexOf(QUOTE, cursor.pos);
    if (quotePos === -1) {
      throw new SyntaxError(`Unterminated quoted field starting at offset ${openingQuotePos}`);
    }
    value += text.slice(cursor.pos, quotePos);
    cursor.pos = quotePos + QUOTE.length;
    if (text[cursor.pos] !== QUOTE) break;
    value += QUOTE;
    cursor.pos += QUOTE.length;
  }
  if (!isFieldEnd(text, cursor.pos)) {
    throw new SyntaxError(`Unexpected character after closing quote at offset ${cursor.pos}`);
  }
  return value;
}

function isFieldEnd(text: string, pos: number): boolean {
  return pos >= text.length || text[pos] === COMMA || lineBreakLength(text, pos) > 0;
}

/** Length of the record terminator (CRLF or LF) at `pos`, or 0 if there is none. */
function lineBreakLength(text: string, pos: number): number {
  if (text[pos] === LF) return LF.length;
  if (text.startsWith(CR + LF, pos)) return CR.length + LF.length;
  return 0;
}
