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
 * Parses CSV text into records of fields, following RFC 4180.
 *
 * Fields are comma-separated and may be enclosed in double quotes. Inside a quoted field, `""`
 * is a literal quote, and commas and line breaks are part of the field. Records end with CRLF
 * or LF; a final line break does not produce an extra empty record. A lone CR outside a quoted
 * field is ordinary field content.
 *
 * @param text - The CSV document.
 * @returns One array of fields per record, in input order; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is unterminated, if anything other than a comma or
 *   line break follows a closing quote, or if a quote appears inside an unquoted field.
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let pos = 0;

  while (pos < text.length) {
    const record: string[] = [];
    // Always read a field after a comma, so a trailing comma yields a final empty field.
    let isFieldPending = true;
    while (isFieldPending) {
      const { value, end } = text[pos] === QUOTE ? readQuotedField(text, pos) : readUnquotedField(text, pos);
      record.push(value);
      isFieldPending = text[end] === COMMA;
      pos = isFieldPending ? end + 1 : end;
    }

    const lineBreakLength = lineBreakLengthAt(text, pos);
    if (lineBreakLength === 0 && pos < text.length) {
      throw new SyntaxError(`Unexpected character ${JSON.stringify(text[pos])} after quoted field at offset ${pos}`);
    }
    records.push(record);
    pos += lineBreakLength;
  }

  return records;
}

interface FieldScan {
  readonly value: string;
  /** Offset just past the field: a comma, a line break, or the end of the text. */
  readonly end: number;
}

function readQuotedField(text: string, start: number): FieldScan {
  let value = "";
  let pos = start + 1;

  while (pos < text.length) {
    const closeAt = text.indexOf(QUOTE, pos);
    if (closeAt === -1) break;
    value += text.slice(pos, closeAt);
    if (text[closeAt + 1] !== QUOTE) return { value, end: closeAt + 1 };
    value += QUOTE;
    pos = closeAt + 2;
  }

  throw new SyntaxError(`Unterminated quoted field starting at offset ${start}`);
}

function readUnquotedField(text: string, start: number): FieldScan {
  let pos = start;
  while (pos < text.length && text[pos] !== COMMA && lineBreakLengthAt(text, pos) === 0) {
    if (text[pos] === QUOTE) {
      throw new SyntaxError(`Unexpected quote inside unquoted field at offset ${pos}`);
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
