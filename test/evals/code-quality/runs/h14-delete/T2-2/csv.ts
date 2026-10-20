/**
 * RFC 4180 CSV parsing.
 *
 * @module
 */

const QUOTE = '"';
const COMMA = ',';
const LF = '\n';
const CR = '\r';

interface ParsedField {
  readonly value: string;
  /** Index just past the field: a comma, the start of a line break, or the end of input. */
  readonly end: number;
}

/**
 * Parses CSV text into records of fields, following RFC 4180.
 *
 * Fields are comma-separated and may be enclosed in double quotes. A quoted field may contain
 * commas and line breaks, and `""` inside it stands for a literal quote. Records end with CRLF
 * or LF; a lone CR is ordinary field data. A line break at the very end of the input does not
 * start another record, but a blank line elsewhere is a record with one empty field.
 *
 * @param text - The full CSV document.
 * @returns One array of field values per record, in input order; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is never closed, if anything other than a comma or
 *   line break follows a closing quote, or if an unquoted field contains a quote.
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let pos = 0;

  while (pos < text.length) {
    const record: string[] = [];
    let hasMoreFields = true;
    while (hasMoreFields) {
      const field = text[pos] === QUOTE ? readQuotedField(text, pos) : readUnquotedField(text, pos);
      record.push(field.value);
      pos = field.end;
      hasMoreFields = text[pos] === COMMA;
      if (hasMoreFields) pos++;
    }
    records.push(record);
    pos += lineBreakLength(text, pos);
  }

  return records;
}

function readUnquotedField(text: string, start: number): ParsedField {
  let pos = start;
  while (pos < text.length && text[pos] !== COMMA && lineBreakLength(text, pos) === 0) {
    if (text[pos] === QUOTE) {
      throw new SyntaxError(`Unexpected quote in unquoted field at index ${pos}`);
    }
    pos++;
  }
  return { value: text.slice(start, pos), end: pos };
}

function readQuotedField(text: string, openQuote: number): ParsedField {
  let value = '';
  let pos = openQuote + 1;

  for (;;) {
    const quote = text.indexOf(QUOTE, pos);
    if (quote === -1) {
      throw new SyntaxError(`Unterminated quoted field starting at index ${openQuote}`);
    }
    value += text.slice(pos, quote);
    if (text[quote + 1] !== QUOTE) {
      pos = quote + 1;
      break;
    }
    value += QUOTE;
    pos = quote + 2;
  }

  const isFieldEnd = pos === text.length || text[pos] === COMMA || lineBreakLength(text, pos) > 0;
  if (!isFieldEnd) {
    throw new SyntaxError(`Unexpected character after closing quote at index ${pos}`);
  }
  return { value, end: pos };
}

/** Length of the record terminator at `pos` (2 for CRLF, 1 for LF), or 0 if there is none. */
function lineBreakLength(text: string, pos: number): number {
  if (text[pos] === LF) return 1;
  if (text[pos] === CR && text[pos + 1] === LF) return 2;
  return 0;
}
