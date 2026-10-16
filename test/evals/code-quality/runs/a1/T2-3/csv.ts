/**
 * RFC 4180 CSV parsing.
 *
 * @module
 */

const QUOTE = '"';
const COMMA = ",";
const CR = "\r";
const LF = "\n";

/**
 * Parses CSV text into records of string fields, following RFC 4180.
 *
 * Fields are comma-separated and may be enclosed in double quotes. Inside a
 * quoted field, `""` is a literal quote, and commas and line breaks are kept
 * as field content. Records end with CRLF or LF; a trailing line break does
 * not produce an extra empty record. A lone CR is ordinary field content, and
 * a quote appearing inside an unquoted field is kept literally.
 *
 * @param text - The CSV document.
 * @returns One array of fields per record; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is not terminated, or if anything
 *   other than a comma, line break, or end of input follows a closing quote.
 */
export function parseCsv(text: string): string[][] {
  if (text.length === 0) return [];

  const records: string[][] = [];
  let record: string[] = [];
  let i = 0;

  for (;;) {
    const parsed = text[i] === QUOTE ? readQuotedField(text, i) : readUnquotedField(text, i);
    record.push(parsed.value);
    i = parsed.end;

    if (i >= text.length) {
      records.push(record);
      return records;
    }

    if (text[i] === COMMA) {
      i += 1;
      continue;
    }

    // Otherwise we are at a record terminator (CRLF or LF).
    i += text[i] === CR ? 2 : 1;
    records.push(record);
    record = [];
    if (i >= text.length) return records;
  }
}

interface ParsedField {
  readonly value: string;
  /** Index of the first character after the field. */
  readonly end: number;
}

function readUnquotedField(text: string, start: number): ParsedField {
  let end = start;
  while (end < text.length && text[end] !== COMMA && !isRecordEnd(text, end)) end += 1;
  return { value: text.slice(start, end), end };
}

function readQuotedField(text: string, start: number): ParsedField {
  let value = "";
  let i = start + 1;

  for (;;) {
    const quote = text.indexOf(QUOTE, i);
    if (quote === -1) {
      throw new SyntaxError(`Unterminated quoted field starting at offset ${start}`);
    }
    value += text.slice(i, quote);
    if (text[quote + 1] !== QUOTE) {
      i = quote + 1;
      break;
    }
    value += QUOTE;
    i = quote + 2;
  }

  if (i < text.length && text[i] !== COMMA && !isRecordEnd(text, i)) {
    throw new SyntaxError(`Unexpected character after closing quote at offset ${i}`);
  }
  return { value, end: i };
}

function isRecordEnd(text: string, i: number): boolean {
  return text[i] === LF || (text[i] === CR && text[i + 1] === LF);
}
