/**
 * RFC 4180 CSV parsing into rows of string fields.
 *
 * @module
 */

const COMMA = ",";
const QUOTE = '"';
const LF = "\n";
const CRLF = "\r\n";

/** Read position over the input; owned by a single `parseCsv` call. */
interface Cursor {
  readonly text: string;
  pos: number;
}

/**
 * Parses CSV text as described by RFC 4180.
 *
 * Fields are separated by commas and may be enclosed in double quotes. Inside a
 * quoted field, `""` is a literal quote, and commas and line breaks are data.
 * Records end with CRLF or LF; a lone CR is ordinary field data. A final line
 * break does not produce an extra empty record, but a blank line elsewhere is a
 * record with one empty field.
 *
 * @param text - The full CSV document.
 * @returns One array of fields per record; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is unterminated, a closing quote is
 *   followed by anything other than a comma or line break, or an unquoted field
 *   contains a quote.
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
  skipLineBreak(cursor);
  return fields;
}

function readField(cursor: Cursor): string {
  return cursor.text.startsWith(QUOTE, cursor.pos)
    ? readQuotedField(cursor)
    : readUnquotedField(cursor);
}

function readUnquotedField(cursor: Cursor): string {
  const start = cursor.pos;
  while (!atFieldEnd(cursor)) {
    if (cursor.text.startsWith(QUOTE, cursor.pos)) {
      throw new SyntaxError(`Unexpected quote in unquoted field at offset ${cursor.pos}`);
    }
    cursor.pos += 1;
  }
  return cursor.text.slice(start, cursor.pos);
}

function readQuotedField(cursor: Cursor): string {
  const openPos = cursor.pos;
  cursor.pos += QUOTE.length;
  let value = "";
  for (;;) {
    const closePos = cursor.text.indexOf(QUOTE, cursor.pos);
    if (closePos === -1) {
      throw new SyntaxError(`Unterminated quoted field starting at offset ${openPos}`);
    }
    value += cursor.text.slice(cursor.pos, closePos);
    cursor.pos = closePos + QUOTE.length;
    if (!cursor.text.startsWith(QUOTE, cursor.pos)) break;
    // A doubled quote is an escaped literal quote, not the end of the field.
    value += QUOTE;
    cursor.pos += QUOTE.length;
  }
  if (!atFieldEnd(cursor)) {
    throw new SyntaxError(`Unexpected character after closing quote at offset ${cursor.pos}`);
  }
  return value;
}

function atFieldEnd(cursor: Cursor): boolean {
  const { text, pos } = cursor;
  return (
    pos >= text.length ||
    text.startsWith(COMMA, pos) ||
    text.startsWith(LF, pos) ||
    text.startsWith(CRLF, pos)
  );
}

function skipLineBreak(cursor: Cursor): void {
  if (cursor.text.startsWith(CRLF, cursor.pos)) {
    cursor.pos += CRLF.length;
  } else if (cursor.text.startsWith(LF, cursor.pos)) {
    cursor.pos += LF.length;
  }
}
