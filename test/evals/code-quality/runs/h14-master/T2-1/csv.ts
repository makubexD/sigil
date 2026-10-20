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
 * Fields are comma-separated and may be enclosed in double quotes. Inside a quoted field, `""`
 * is a literal quote, and commas and line breaks are kept verbatim. Records end with CRLF or LF;
 * a single trailing line break does not produce an empty record. A lone CR outside a quoted field
 * is ordinary field content.
 *
 * @param text - The CSV document.
 * @returns One array of fields per record; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is unterminated, a quoted field is followed by anything
 *   other than a comma or line break, or an unquoted field contains a double quote.
 */
export function parseCsv(text: string): string[][] {
  if (text === "") return [];

  const records: string[][] = [];
  let record: string[] = [];
  let pos = 0;

  while (true) {
    const field = text[pos] === QUOTE ? readQuotedField(text, pos) : readUnquotedField(text, pos);
    record.push(field.value);
    pos = field.end;

    if (text[pos] === COMMA) {
      pos += 1;
      continue;
    }

    records.push(record);
    record = [];
    const lineBreakLength = lineBreakLengthAt(text, pos);
    if (lineBreakLength === 0) {
      if (pos < text.length) {
        throw new SyntaxError(`Unexpected character ${JSON.stringify(text[pos])} at offset ${pos}`);
      }
      return records;
    }
    pos += lineBreakLength;
    // The final line break terminates the last record rather than starting an empty one.
    if (pos === text.length) return records;
  }
}

interface FieldScan {
  readonly value: string;
  /** Offset just past the field, pointing at a delimiter, line break, or end of input. */
  readonly end: number;
}

function readQuotedField(text: string, start: number): FieldScan {
  let value = "";
  let pos = start + 1;

  while (pos < text.length) {
    const closingQuote = text.indexOf(QUOTE, pos);
    if (closingQuote === -1) break;

    value += text.slice(pos, closingQuote);
    if (text[closingQuote + 1] !== QUOTE) {
      return { value, end: closingQuote + 1 };
    }
    value += QUOTE;
    pos = closingQuote + 2;
  }

  throw new SyntaxError(`Unterminated quoted field starting at offset ${start}`);
}

function readUnquotedField(text: string, start: number): FieldScan {
  let pos = start;
  while (pos < text.length && text[pos] !== COMMA && lineBreakLengthAt(text, pos) === 0) {
    if (text[pos] === QUOTE) {
      throw new SyntaxError(`Unexpected quote in unquoted field at offset ${pos}`);
    }
    pos += 1;
  }
  return { value: text.slice(start, pos), end: pos };
}

/** Returns 2 for CRLF, 1 for LF, and 0 when no record terminator starts at `pos`. */
function lineBreakLengthAt(text: string, pos: number): number {
  if (text[pos] === LF) return 1;
  if (text[pos] === CR && text[pos + 1] === LF) return 2;
  return 0;
}
