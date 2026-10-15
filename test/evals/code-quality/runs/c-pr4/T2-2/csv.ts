/**
 * RFC 4180 CSV parsing.
 *
 * @module
 */

const QUOTE = '"';
const DELIMITER = ',';
const LF = '\n';
const CR = '\r';

interface ScannedField {
  readonly value: string;
  /** Offset just past the field's last character (including a closing quote). */
  readonly end: number;
}

interface ScannedRecord {
  readonly fields: string[];
  /** Offset just past the record's terminator, or the end of input. */
  readonly end: number;
}

/** Length of the record terminator at `at`: 2 for CRLF, 1 for LF, 0 if none. */
function lineBreakLength(text: string, at: number): number {
  if (text[at] === LF) return 1;
  if (text[at] === CR && text[at + 1] === LF) return 2;
  return 0;
}

function scanQuotedField(text: string, start: number): ScannedField {
  let value = '';
  let cursor = start + 1;
  for (;;) {
    const quoteAt = text.indexOf(QUOTE, cursor);
    if (quoteAt === -1) {
      throw new SyntaxError(`Unterminated quoted field starting at offset ${start}`);
    }
    value += text.slice(cursor, quoteAt);
    if (text[quoteAt + 1] !== QUOTE) return { value, end: quoteAt + 1 };
    value += QUOTE;
    cursor = quoteAt + 2;
  }
}

function scanUnquotedField(text: string, start: number): ScannedField {
  let end = start;
  while (end < text.length && text[end] !== DELIMITER && lineBreakLength(text, end) === 0) {
    end++;
  }
  return { value: text.slice(start, end), end };
}

function scanField(text: string, start: number): ScannedField {
  return text[start] === QUOTE ? scanQuotedField(text, start) : scanUnquotedField(text, start);
}

function scanRecord(text: string, start: number): ScannedRecord {
  const fields: string[] = [];
  let cursor = start;
  for (;;) {
    const field = scanField(text, cursor);
    fields.push(field.value);
    cursor = field.end;
    if (text[cursor] !== DELIMITER) break;
    cursor++;
  }
  if (cursor === text.length) return { fields, end: cursor };
  const breakLength = lineBreakLength(text, cursor);
  if (breakLength === 0) {
    throw new SyntaxError(`Unexpected character after closing quote at offset ${cursor}`);
  }
  return { fields, end: cursor + breakLength };
}

/**
 * Parses CSV text into records of string fields, following RFC 4180.
 *
 * Fields are comma-separated and records end with CRLF or LF. A double-quoted field may contain
 * commas, line breaks, and `""` (a literal quote). A line break at the very end of the input does
 * not start another record. A lone CR not followed by LF is ordinary field data.
 *
 * @param text - The full CSV document.
 * @returns One array of fields per record; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is unterminated, or a closing quote is followed by
 *   anything other than a comma, line break, or end of input (e.g. `"a"b`).
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let cursor = 0;
  // Stopping once the cursor reaches the end is what keeps a final line break from adding a record.
  while (cursor < text.length) {
    const scanned = scanRecord(text, cursor);
    records.push(scanned.fields);
    cursor = scanned.end;
  }
  return records;
}
