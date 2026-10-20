/**
 * RFC 4180 CSV parser.
 *
 * @module
 */

const FIELD_SEPARATOR = ',';
const QUOTE = '"';
const ESCAPED_QUOTE = '""';
const LF = '\n';
const CR = '\r';

/**
 * Parses CSV text into records of string fields, following RFC 4180.
 *
 * Fields are comma-separated and may be enclosed in double quotes. Inside a quoted field,
 * `""` is a literal quote, and commas and line breaks are field data. Records end with CRLF
 * or LF; a final line break does not produce an empty record. A lone CR (not followed by LF)
 * outside quotes is ordinary field data. Whitespace is never trimmed.
 *
 * @param text - The full CSV document.
 * @returns One array of fields per record, in input order; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is unterminated, a quote appears inside an
 *   unquoted field, or anything other than a separator, line break, or end of input
 *   follows a closing quote. The message includes the character offset.
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let offset = 0;

  while (offset < text.length) {
    const { value, end } =
      text[offset] === QUOTE ? readQuotedField(text, offset) : readUnquotedField(text, offset);
    record.push(value);
    offset = end;

    if (offset >= text.length) break;

    if (text[offset] === FIELD_SEPARATOR) {
      offset += FIELD_SEPARATOR.length;
      // A separator at end of input still delimits one more (empty) field.
      if (offset >= text.length) record.push('');
      continue;
    }

    offset += lineBreakLengthAt(text, offset);
    records.push(record);
    record = [];
  }

  if (record.length > 0) records.push(record);
  return records;
}

interface FieldRead {
  readonly value: string;
  /** Offset of the first character after the field. */
  readonly end: number;
}

function readQuotedField(text: string, start: number): FieldRead {
  let value = '';
  let offset = start + QUOTE.length;

  for (;;) {
    const quoteAt = text.indexOf(QUOTE, offset);
    if (quoteAt === -1) {
      throw new SyntaxError(`Unterminated quoted field starting at offset ${start}`);
    }
    value += text.slice(offset, quoteAt);
    if (text.startsWith(ESCAPED_QUOTE, quoteAt)) {
      value += QUOTE;
      offset = quoteAt + ESCAPED_QUOTE.length;
      continue;
    }
    offset = quoteAt + QUOTE.length;
    break;
  }

  if (!isFieldEnd(text, offset)) {
    throw new SyntaxError(`Unexpected character after closing quote at offset ${offset}`);
  }
  return { value, end: offset };
}

function readUnquotedField(text: string, start: number): FieldRead {
  let offset = start;
  while (!isFieldEnd(text, offset)) {
    if (text[offset] === QUOTE) {
      throw new SyntaxError(`Unexpected quote in unquoted field at offset ${offset}`);
    }
    offset++;
  }
  return { value: text.slice(start, offset), end: offset };
}

function isFieldEnd(text: string, offset: number): boolean {
  return (
    offset >= text.length ||
    text[offset] === FIELD_SEPARATOR ||
    lineBreakLengthAt(text, offset) > 0
  );
}

/** Length of the CRLF or LF line break at `offset`, or 0 if there is none. */
function lineBreakLengthAt(text: string, offset: number): number {
  if (text[offset] === LF) return LF.length;
  if (text.startsWith(CR + LF, offset)) return CR.length + LF.length;
  return 0;
}
