/**
 * RFC 4180 CSV parsing.
 *
 * @module
 */

const COMMA = ',';
const QUOTE = '"';
const CR = '\r';
const LF = '\n';

/**
 * Parses CSV text into records of fields, following RFC 4180.
 *
 * Fields are comma-separated and may be double-quoted; inside a quoted field `""` is a literal
 * quote, and commas and line breaks are kept verbatim. Records end with CRLF or LF; a final line
 * break does not produce an extra empty record. A lone CR outside a quoted field is field data.
 *
 * @param text - The CSV document.
 * @returns One array of fields per record, in input order; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is unterminated, if a closing quote is followed by
 *   anything other than a comma or line break, or if an unquoted field contains a quote.
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  if (text === '') return records;

  let record: string[] = [];
  let i = 0;

  while (i < text.length) {
    let field: string;
    if (text[i] === QUOTE) {
      [field, i] = readQuotedField(text, i);
    } else {
      [field, i] = readUnquotedField(text, i);
    }
    record.push(field);

    if (i >= text.length) {
      records.push(record);
      break;
    }

    const lineBreakLength = lineBreakLengthAt(text, i);
    if (lineBreakLength > 0) {
      records.push(record);
      record = [];
      i += lineBreakLength;
      continue;
    }

    if (text[i] !== COMMA) {
      throw new SyntaxError(`Unexpected character after closing quote at offset ${i}`);
    }
    i += 1;
    // A trailing comma at end of input still denotes one more (empty) field.
    if (i >= text.length) {
      record.push('');
      records.push(record);
    }
  }

  return records;
}

/** Returns 2 for CRLF, 1 for LF, or 0 if no record terminator starts at `index`. */
function lineBreakLengthAt(text: string, index: number): number {
  if (text[index] === LF) return 1;
  if (text[index] === CR && text[index + 1] === LF) return 2;
  return 0;
}

/** Reads a quoted field starting at the opening quote; returns its value and the index after the closing quote. */
function readQuotedField(text: string, start: number): [string, number] {
  let value = '';
  let i = start + 1;

  while (i < text.length) {
    const closeIndex = text.indexOf(QUOTE, i);
    if (closeIndex === -1) break;

    value += text.slice(i, closeIndex);
    if (text[closeIndex + 1] === QUOTE) {
      value += QUOTE;
      i = closeIndex + 2;
    } else {
      return [value, closeIndex + 1];
    }
  }

  throw new SyntaxError(`Unterminated quoted field starting at offset ${start}`);
}

/** Reads an unquoted field; returns its value and the index of the comma, line break, or end of input that ends it. */
function readUnquotedField(text: string, start: number): [string, number] {
  let i = start;
  while (i < text.length && text[i] !== COMMA && lineBreakLengthAt(text, i) === 0) {
    if (text[i] === QUOTE) {
      throw new SyntaxError(`Unexpected quote in unquoted field at offset ${i}`);
    }
    i += 1;
  }
  return [text.slice(start, i), i];
}
