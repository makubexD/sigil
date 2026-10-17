/**
 * RFC 4180 CSV parser that turns CSV text into rows of string fields.
 *
 * @module
 */

const COMMA = ",";
const QUOTE = '"';
const CR = "\r";
const LF = "\n";

/**
 * Parses CSV text into records of fields, following RFC 4180.
 *
 * Fields are comma-separated and may be enclosed in double quotes. Inside a
 * quoted field, `""` is a literal quote, and commas and line breaks are kept
 * as data. Records end with CRLF or LF. A final line break does not produce
 * an empty record. A lone CR outside a quoted field is kept as field data.
 *
 * @param text - The CSV document.
 * @returns One array of fields per record, or `[]` when `text` is empty.
 * @throws {SyntaxError} If a quoted field is unterminated, if a quoted field
 *   is followed by anything other than a comma or line break, or if an
 *   unquoted field contains a double quote.
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  if (text.length === 0) return records;

  let record: string[] = [];
  let index = 0;

  while (true) {
    const { value, end } = text[index] === QUOTE ? readQuotedField(text, index) : readUnquotedField(text, index);
    record.push(value);
    index = end;

    if (index >= text.length) {
      records.push(record);
      return records;
    }
    if (text[index] === COMMA) {
      index += 1;
      continue;
    }

    // Only a line break can follow a field here; the field readers enforce it.
    index += text.startsWith(CR + LF, index) ? 2 : 1;
    records.push(record);
    record = [];
    if (index >= text.length) return records;
  }
}

interface FieldResult {
  readonly value: string;
  /** Index of the character just past the field: a comma, line break, or end of text. */
  readonly end: number;
}

function readQuotedField(text: string, start: number): FieldResult {
  let value = "";
  let index = start + 1;

  while (index < text.length) {
    const closingQuote = text.indexOf(QUOTE, index);
    if (closingQuote === -1) break;

    value += text.slice(index, closingQuote);
    if (text[closingQuote + 1] === QUOTE) {
      value += QUOTE;
      index = closingQuote + 2;
      continue;
    }

    const end = closingQuote + 1;
    if (!isFieldBoundary(text, end)) {
      throw new SyntaxError(`Unexpected character after closing quote at offset ${end}`);
    }
    return { value, end };
  }

  throw new SyntaxError(`Unterminated quoted field starting at offset ${start}`);
}

function readUnquotedField(text: string, start: number): FieldResult {
  let index = start;
  while (index < text.length && !isFieldBoundary(text, index)) {
    if (text[index] === QUOTE) {
      throw new SyntaxError(`Unexpected quote in unquoted field at offset ${index}`);
    }
    index += 1;
  }
  return { value: text.slice(start, index), end: index };
}

function isFieldBoundary(text: string, index: number): boolean {
  if (index >= text.length) return true;
  const char = text[index];
  return char === COMMA || char === LF || text.startsWith(CR + LF, index);
}
