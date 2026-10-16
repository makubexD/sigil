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
 * Fields are comma-separated and may be wrapped in double quotes; inside a quoted field, `""`
 * is a literal quote and commas and line breaks are kept verbatim. Records end with CRLF or LF,
 * and a trailing line break does not add an empty record. A blank line in the middle of the
 * input is a record with one empty field. A quote inside an unquoted field and a CR not followed
 * by LF are kept as literal characters.
 *
 * @param text - The CSV document.
 * @returns One array of field strings per record; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is unterminated, or if anything other than a comma or
 *   line break follows a closing quote.
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let pos = 0;

  while (pos < text.length) {
    if (text[pos] === QUOTE && field === '') {
      const quoted = readQuotedField(text, pos);
      field = quoted.value;
      pos = quoted.end;
      const next = text[pos];
      if (next !== undefined && next !== COMMA && next !== LF && !text.startsWith(CR + LF, pos)) {
        throw new SyntaxError(`Unexpected character after closing quote at offset ${pos}`);
      }
      continue;
    }

    const char = text[pos];
    if (char === COMMA) {
      record.push(field);
      field = '';
      pos += 1;
    } else if (char === LF || text.startsWith(CR + LF, pos)) {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      pos += char === LF ? 1 : 2;
    } else {
      field += char;
      pos += 1;
    }
  }

  // Input that ends without a line break leaves its last record unflushed.
  const endsMidRecord = text.length > 0 && !text.endsWith(LF);
  if (endsMidRecord) {
    record.push(field);
    records.push(record);
  }
  return records;
}

/**
 * Reads a quoted field whose opening quote is at `start`.
 *
 * @returns The unescaped field value and the offset just past the closing quote.
 * @throws {SyntaxError} If the input ends before the closing quote.
 */
function readQuotedField(text: string, start: number): { value: string; end: number } {
  let value = '';
  let pos = start + 1;

  while (pos < text.length) {
    const closeAt = text.indexOf(QUOTE, pos);
    if (closeAt === -1) break;
    value += text.slice(pos, closeAt);
    if (text[closeAt + 1] !== QUOTE) {
      return { value, end: closeAt + 1 };
    }
    value += QUOTE;
    pos = closeAt + 2;
  }

  throw new SyntaxError(`Unterminated quoted field starting at offset ${start}`);
}
