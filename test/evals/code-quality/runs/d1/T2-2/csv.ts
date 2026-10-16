/**
 * RFC 4180 CSV parser that turns CSV text into records of string fields.
 *
 * @module
 */

const QUOTE = '"';
const ESCAPED_QUOTE = '""';
const FIELD_SEPARATOR = ',';
const LF = '\n';
const CRLF = '\r\n';

/** A decoded field and the index just past its last character. */
interface ScannedField {
  readonly value: string;
  readonly end: number;
}

/** A record's fields and the index just past its line break, if any. */
interface ScannedRecord {
  readonly fields: string[];
  readonly end: number;
}

/**
 * Parses RFC 4180 CSV text into records of fields.
 *
 * Records end with CRLF or LF; a trailing line break does not add an empty record.
 * Quoted fields may contain commas, line breaks, and `""` escaped quotes.
 *
 * @param text - The full CSV document.
 * @returns One string array per record, or `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is unterminated, a closing quote is followed by
 *   anything other than a comma, line break, or end of input, or an unquoted field contains a quote.
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let pos = 0;
  while (pos < text.length) {
    const record = scanRecord(text, pos);
    records.push(record.fields);
    pos = record.end;
  }
  return records;
}

function scanRecord(text: string, start: number): ScannedRecord {
  const fields: string[] = [];
  let pos = start;
  for (;;) {
    const field = text[pos] === QUOTE ? scanQuotedField(text, pos) : scanUnquotedField(text, pos);
    fields.push(field.value);
    pos = field.end;
    if (text[pos] !== FIELD_SEPARATOR) break;
    pos += FIELD_SEPARATOR.length;
  }
  return { fields, end: pos + lineBreakLength(text, pos) };
}

function scanUnquotedField(text: string, start: number): ScannedField {
  let pos = start;
  while (pos < text.length && !isFieldTerminator(text, pos)) {
    if (text[pos] === QUOTE) {
      throw new SyntaxError(`Unexpected quote in unquoted field at index ${pos}`);
    }
    pos++;
  }
  return { value: text.slice(start, pos), end: pos };
}

function scanQuotedField(text: string, start: number): ScannedField {
  let value = '';
  let pos = start + QUOTE.length;

  while (pos < text.length) {
    const closingQuote = text.indexOf(QUOTE, pos);
    if (closingQuote === -1) break;

    value += text.slice(pos, closingQuote);
    if (text.startsWith(ESCAPED_QUOTE, closingQuote)) {
      value += QUOTE;
      pos = closingQuote + ESCAPED_QUOTE.length;
      continue;
    }

    const end = closingQuote + QUOTE.length;
    if (end < text.length && !isFieldTerminator(text, end)) {
      throw new SyntaxError(`Unexpected character after closing quote at index ${end}`);
    }
    return { value, end };
  }

  throw new SyntaxError(`Unterminated quoted field starting at index ${start}`);
}

function isFieldTerminator(text: string, pos: number): boolean {
  return text[pos] === FIELD_SEPARATOR || lineBreakLength(text, pos) > 0;
}

/** Length of the record terminator at `pos`, or 0 if there is none. */
function lineBreakLength(text: string, pos: number): number {
  if (text.startsWith(CRLF, pos)) return CRLF.length;
  if (text.startsWith(LF, pos)) return LF.length;
  return 0;
}
