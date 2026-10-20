/**
 * RFC 4180 CSV parser.
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
 * Fields are comma-separated and may be enclosed in double quotes; inside a quoted field, `""` is a
 * literal quote and commas and line breaks are field data. Records end with CRLF or LF, and a
 * trailing line break does not produce an extra empty record. A lone CR outside a quoted field is
 * kept as field data.
 *
 * @param text - The full CSV document.
 * @returns One array of fields per record; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is unterminated, if a closing quote is followed by
 *   anything other than a comma or line break, or if a quote appears inside an unquoted field.
 */
export function parseCsv(text: string): string[][] {
  if (text.length === 0) return [];

  const records: string[][] = [];
  let record: string[] = [];
  let index = 0;

  while (true) {
    const isQuoted = text[index] === QUOTE;
    const { value, end } = isQuoted ? readQuotedField(text, index) : readUnquotedField(text, index);
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

    index += lineBreakLength(text, index);
    records.push(record);
    record = [];
    if (index >= text.length) return records;
  }
}

interface FieldScan {
  readonly value: string;
  /** Index of the delimiter (comma or line break) after the field, or `text.length`. */
  readonly end: number;
}

function readUnquotedField(text: string, start: number): FieldScan {
  let index = start;
  while (index < text.length && text[index] !== COMMA && lineBreakLength(text, index) === 0) {
    if (text[index] === QUOTE) {
      throw new SyntaxError(`Unexpected quote inside unquoted field at offset ${index}`);
    }
    index += 1;
  }
  return { value: text.slice(start, index), end: index };
}

function readQuotedField(text: string, openQuoteIndex: number): FieldScan {
  let value = "";
  let chunkStart = openQuoteIndex + 1;

  while (true) {
    const quoteIndex = text.indexOf(QUOTE, chunkStart);
    if (quoteIndex === -1) {
      throw new SyntaxError(`Unterminated quoted field starting at offset ${openQuoteIndex}`);
    }
    value += text.slice(chunkStart, quoteIndex);

    if (text[quoteIndex + 1] === QUOTE) {
      value += QUOTE;
      chunkStart = quoteIndex + 2;
      continue;
    }

    const end = quoteIndex + 1;
    if (end < text.length && text[end] !== COMMA && lineBreakLength(text, end) === 0) {
      throw new SyntaxError(`Unexpected character after closing quote at offset ${end}`);
    }
    return { value, end };
  }
}

/** Returns 2 for CRLF, 1 for LF, and 0 when no record terminator starts at `index`. */
function lineBreakLength(text: string, index: number): number {
  if (text[index] === LF) return 1;
  if (text[index] === CR && text[index + 1] === LF) return 2;
  return 0;
}
