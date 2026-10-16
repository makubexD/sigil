/**
 * RFC 4180 CSV parser.
 *
 * @module
 */

const QUOTE = '"';
const COMMA = ',';
const CR = '\r';
const LF = '\n';

/** A parsed value together with the offset just past the text it was read from. */
interface Parsed<T> {
  readonly value: T;
  readonly end: number;
}

/**
 * Parses CSV text into records of fields, following RFC 4180.
 *
 * Fields are comma-separated and may be double-quoted; inside a quoted field `""` is a literal
 * quote, and commas and line breaks are kept verbatim. Records end with CRLF or LF; a lone CR is
 * field data. A trailing line break does not produce an extra empty record, but a blank line
 * elsewhere is a record with one empty field.
 *
 * @param text - The CSV document.
 * @returns One array of fields per record; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is unterminated, or a closing quote is followed by
 *   anything other than a comma, a line break, or the end of input.
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let position = 0;
  while (position < text.length) {
    const record = readRecord(text, position);
    records.push(record.value);
    position = record.end;
  }
  return records;
}

function readRecord(text: string, start: number): Parsed<string[]> {
  const fields: string[] = [];
  let position = start;
  for (;;) {
    const field = text[position] === QUOTE ? readQuotedField(text, position) : readUnquotedField(text, position);
    fields.push(field.value);
    position = field.end;
    if (text[position] !== COMMA) {
      return { value: fields, end: position + lineBreakLength(text, position) };
    }
    position += 1;
  }
}

function readUnquotedField(text: string, start: number): Parsed<string> {
  let position = start;
  while (!isFieldBoundary(text, position)) {
    position += 1;
  }
  return { value: text.slice(start, position), end: position };
}

function readQuotedField(text: string, openingQuote: number): Parsed<string> {
  let value = '';
  let position = openingQuote + 1;
  for (;;) {
    const quote = text.indexOf(QUOTE, position);
    if (quote === -1) {
      throw new SyntaxError(`Unterminated quoted field starting at offset ${openingQuote}`);
    }
    value += text.slice(position, quote);
    if (text[quote + 1] === QUOTE) {
      value += QUOTE;
      position = quote + 2;
      continue;
    }
    const end = quote + 1;
    if (!isFieldBoundary(text, end)) {
      throw new SyntaxError(`Unexpected character after closing quote at offset ${end}`);
    }
    return { value, end };
  }
}

function isFieldBoundary(text: string, position: number): boolean {
  return position >= text.length || text[position] === COMMA || lineBreakLength(text, position) > 0;
}

/** Returns 2 for CRLF, 1 for LF, and 0 when no record terminator starts at `position`. */
function lineBreakLength(text: string, position: number): number {
  if (text[position] === LF) return 1;
  if (text[position] === CR && text[position + 1] === LF) return 2;
  return 0;
}
