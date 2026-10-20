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
 * Fields are comma-separated and may be wrapped in double quotes. Inside a quoted field, `""` is a
 * literal quote, and commas and line breaks are kept as data. Records end with CRLF or LF; a final
 * line break does not produce an extra empty record. A lone CR outside a quoted field is kept as
 * field data. A quote inside an unquoted field is kept as a literal character.
 *
 * @param text - The CSV document.
 * @returns One array of fields per record, or `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is never closed, or a closing quote is followed by
 *   anything other than a comma, a line break, or the end of input.
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  if (text === "") return records;

  let record: string[] = [];
  let field = "";
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (char === QUOTE && field === "") {
      const closingIndex = findClosingQuote(text, i + 1);
      field = text.slice(i + 1, closingIndex).replaceAll(QUOTE + QUOTE, QUOTE);
      i = closingIndex + 1;
      if (i < text.length && !isFieldEnd(text, i)) {
        throw new SyntaxError(`Unexpected character after closing quote at index ${i}`);
      }
      continue;
    }

    if (char === COMMA) {
      record.push(field);
      field = "";
      i += 1;
      continue;
    }

    const lineBreakLength = lineBreakLengthAt(text, i);
    if (lineBreakLength > 0) {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      i += lineBreakLength;
      continue;
    }

    field += char;
    i += 1;
  }

  // The loop only flushes a record on a line break, so flush the last one unless the input ended
  // with a line break (which already flushed it).
  if (lineBreakLengthBefore(text) === 0) {
    record.push(field);
    records.push(record);
  }

  return records;
}

/** Returns the index of the quote that closes a quoted field whose content starts at `start`. */
function findClosingQuote(text: string, start: number): number {
  let i = start;
  while (i < text.length) {
    if (text[i] !== QUOTE) {
      i += 1;
    } else if (text[i + 1] === QUOTE) {
      i += 2;
    } else {
      return i;
    }
  }
  throw new SyntaxError(`Unterminated quoted field starting at index ${start - 1}`);
}

function isFieldEnd(text: string, index: number): boolean {
  return text[index] === COMMA || lineBreakLengthAt(text, index) > 0;
}

/** Returns 2 for CRLF, 1 for LF, or 0 if no record-ending line break starts at `index`. */
function lineBreakLengthAt(text: string, index: number): number {
  if (text[index] === LF) return 1;
  if (text[index] === CR && text[index + 1] === LF) return 2;
  return 0;
}

/** Returns the length of the line break that ends `text`, or 0 if it does not end with one. */
function lineBreakLengthBefore(text: string): number {
  if (text.endsWith(CR + LF)) return 2;
  if (text.endsWith(LF)) return 1;
  return 0;
}
