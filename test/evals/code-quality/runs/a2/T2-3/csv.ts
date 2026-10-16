/**
 * RFC 4180 CSV parser.
 *
 * @module
 */

const FIELD_SEPARATOR = ',';
const QUOTE = '"';
const ESCAPED_QUOTE = '""';
const LF = '\n';
const CRLF = '\r\n';

/** A field's decoded value and the offset just past its last character in the source text. */
interface FieldToken {
  readonly value: string;
  readonly end: number;
}

/**
 * Parses CSV text into records of string fields, following RFC 4180.
 *
 * Fields are separated by commas and records end with CRLF or LF. A double-quoted field may
 * contain commas, line breaks, and `""` as an escaped literal quote. A final line break does not
 * produce an empty trailing record, but a blank line elsewhere is a record with one empty field.
 * A lone CR outside a quoted field is ordinary data.
 *
 * @param text - The full CSV document.
 * @returns One array of fields per record; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is never closed, or a closing quote is followed by
 *   anything other than a comma, a line break, or end of input.
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let pos = 0;

  while (pos < text.length) {
    const field = readField(text, pos);
    record.push(field.value);
    pos = field.end;

    if (text.startsWith(FIELD_SEPARATOR, pos)) {
      pos += FIELD_SEPARATOR.length;
      if (pos < text.length) continue;
      // A separator at end of input still delimits one more (empty) field.
      record.push('');
    }

    pos = skipRecordTerminator(text, pos);
    records.push(record);
    record = [];
  }

  return records;
}

function readField(text: string, start: number): FieldToken {
  return text.startsWith(QUOTE, start) ? readQuotedField(text, start) : readUnquotedField(text, start);
}

function readQuotedField(text: string, start: number): FieldToken {
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

function readUnquotedField(text: string, start: number): FieldToken {
  let end = start;
  while (end < text.length && !isFieldBoundary(text, end)) end++;
  return { value: text.slice(start, end), end };
}

function isFieldBoundary(text: string, pos: number): boolean {
  return text.startsWith(FIELD_SEPARATOR, pos) || text.startsWith(LF, pos) || text.startsWith(CRLF, pos);
}

/**
 * Returns the offset just past the record terminator at `pos`, or `pos` itself at end of input.
 * Only a closing quote can leave `pos` on anything else, since unquoted fields stop at boundaries.
 */
function skipRecordTerminator(text: string, pos: number): number {
  if (pos === text.length) return pos;
  if (text.startsWith(CRLF, pos)) return pos + CRLF.length;
  if (text.startsWith(LF, pos)) return pos + LF.length;
  throw new SyntaxError(`Unexpected character after closing quote at offset ${pos}`);
}
