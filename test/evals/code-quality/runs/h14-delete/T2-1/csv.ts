/**
 * RFC 4180 CSV parser — turns CSV text into rows of string fields.
 *
 * @module
 */

const QUOTE = '"';
const ESCAPED_QUOTE = '""';
const DELIMITER = ",";
const LF = "\n";
const CRLF = "\r\n";

interface FieldResult {
  readonly value: string;
  readonly end: number;
}

/**
 * Parses CSV text into records of fields, following RFC 4180.
 *
 * Fields are comma-separated and may be double-quoted; inside a quoted field,
 * `""` is a literal quote and commas and line breaks are kept verbatim.
 * Records end with CRLF or LF, and a final line break does not produce an
 * empty record. A lone CR outside a quoted field is kept as field content.
 *
 * @param text - The CSV document.
 * @returns One array of fields per record; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is unterminated, or if a closing
 *   quote is followed by anything other than a comma, line break, or end of input.
 */
export function parseCsv(text: string): string[][] {
  if (text === "") return [];

  const records: string[][] = [];
  let record: string[] = [];
  let pos = 0;

  for (;;) {
    const field = text.startsWith(QUOTE, pos) ? readQuotedField(text, pos) : readUnquotedField(text, pos);
    record.push(field.value);
    pos = field.end;

    if (pos >= text.length) {
      records.push(record);
      return records;
    }

    if (text.startsWith(DELIMITER, pos)) {
      pos += DELIMITER.length;
      continue;
    }

    pos += text.startsWith(CRLF, pos) ? CRLF.length : LF.length;
    records.push(record);
    record = [];
    if (pos >= text.length) return records;
  }
}

/** Reads an unquoted field starting at `start`; `end` points at the terminator or end of input. */
function readUnquotedField(text: string, start: number): FieldResult {
  let end = start;
  while (end < text.length && !isFieldTerminator(text, end)) end++;
  return { value: text.slice(start, end), end };
}

/** Reads a quoted field whose opening quote is at `start`; `end` points just past the closing quote. */
function readQuotedField(text: string, start: number): FieldResult {
  let value = "";
  let pos = start + QUOTE.length;

  for (;;) {
    const quoteAt = text.indexOf(QUOTE, pos);
    if (quoteAt === -1) {
      throw new SyntaxError(`Unterminated quoted field starting at offset ${start}`);
    }
    value += text.slice(pos, quoteAt);

    if (text.startsWith(ESCAPED_QUOTE, quoteAt)) {
      value += QUOTE;
      pos = quoteAt + ESCAPED_QUOTE.length;
      continue;
    }

    const end = quoteAt + QUOTE.length;
    if (end < text.length && !isFieldTerminator(text, end)) {
      throw new SyntaxError(`Unexpected character after closing quote at offset ${end}`);
    }
    return { value, end };
  }
}

function isFieldTerminator(text: string, pos: number): boolean {
  return text.startsWith(DELIMITER, pos) || text.startsWith(LF, pos) || text.startsWith(CRLF, pos);
}
