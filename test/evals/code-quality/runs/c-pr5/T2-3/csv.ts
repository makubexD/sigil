/**
 * RFC 4180 CSV parser that turns CSV text into rows of string fields.
 *
 * @module
 */

const QUOTE = '"';
const ESCAPED_QUOTE = '""';
const COMMA = ',';
const LF = '\n';
const CRLF = '\r\n';

interface FieldResult {
  readonly value: string;
  /** Offset just past the field: a comma, a line break, or the end of the text. */
  readonly end: number;
}

interface RecordResult {
  readonly fields: string[];
  /** Offset of the next record, past any line break. */
  readonly end: number;
}

/**
 * Parses RFC 4180 CSV text into records of fields.
 *
 * Records end with CRLF or LF; a lone CR is ordinary field content. A line break
 * after the last record does not add an empty record. Quoted fields may contain
 * commas, line breaks, and `""` escapes for a literal quote. A quote inside an
 * unquoted field is kept as a literal character.
 *
 * @param text - The full CSV document.
 * @returns One array of fields per record; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is unterminated, or its closing quote is
 *   followed by anything other than a comma, a line break, or the end of the text.
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let pos = 0;
  while (pos < text.length) {
    const record = parseRecord(text, pos);
    records.push(record.fields);
    pos = record.end;
  }
  return records;
}

function parseRecord(text: string, start: number): RecordResult {
  const fields: string[] = [];
  let pos = start;
  for (;;) {
    const field = parseField(text, pos);
    fields.push(field.value);
    pos = field.end;
    if (text[pos] !== COMMA) {
      return { fields, end: pos + lineBreakLength(text, pos) };
    }
    pos += COMMA.length;
  }
}

function parseField(text: string, start: number): FieldResult {
  return text[start] === QUOTE
    ? parseQuotedField(text, start)
    : parseUnquotedField(text, start);
}

function parseUnquotedField(text: string, start: number): FieldResult {
  let pos = start;
  while (pos < text.length && text[pos] !== COMMA && lineBreakLength(text, pos) === 0) {
    pos += 1;
  }
  return { value: text.slice(start, pos), end: pos };
}

function parseQuotedField(text: string, start: number): FieldResult {
  let value = '';
  let pos = start + QUOTE.length;
  for (;;) {
    const quoteAt = text.indexOf(QUOTE, pos);
    if (quoteAt === -1) {
      throw new SyntaxError(`Unterminated quoted field starting at offset ${start}`);
    }
    value += text.slice(pos, quoteAt);
    if (!text.startsWith(ESCAPED_QUOTE, quoteAt)) {
      return { value, end: expectFieldEnd(text, quoteAt + QUOTE.length) };
    }
    value += QUOTE;
    pos = quoteAt + ESCAPED_QUOTE.length;
  }
}

function expectFieldEnd(text: string, pos: number): number {
  const atFieldEnd =
    pos === text.length || text[pos] === COMMA || lineBreakLength(text, pos) > 0;
  if (!atFieldEnd) {
    throw new SyntaxError(`Unexpected character after closing quote at offset ${pos}`);
  }
  return pos;
}

/** Length of the record terminator at `pos`, or 0 if there is none. */
function lineBreakLength(text: string, pos: number): number {
  if (text.startsWith(CRLF, pos)) return CRLF.length;
  if (text[pos] === LF) return LF.length;
  return 0;
}
