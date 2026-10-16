/**
 * RFC 4180 CSV parser.
 *
 * @module
 */

const QUOTE = '"';
const ESCAPED_QUOTE_LENGTH = 2;
const COMMA = ",";
const CR = "\r";
const LF = "\n";

interface Scanned<T> {
  readonly value: T;
  readonly next: number;
}

/**
 * Parses CSV text into records of string fields, following RFC 4180.
 *
 * Fields are comma-separated and may be double-quoted; inside a quoted field `""` is a
 * literal quote, and commas and line breaks are kept verbatim. Records end with CRLF or
 * LF, and a final line break does not produce an empty record. A lone CR outside a
 * quoted field is treated as field data, as is a `"` that does not open a field.
 *
 * @param text - The full CSV document.
 * @returns One array of fields per record; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is unterminated, or its closing quote is
 *   followed by anything other than a comma, line break, or end of input.
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let pos = 0;
  while (pos < text.length) {
    const record = readRecord(text, pos);
    records.push(record.value);
    pos = record.next;
  }
  return records;
}

function readRecord(text: string, start: number): Scanned<string[]> {
  const fields: string[] = [];
  let pos = start;
  for (;;) {
    const field = readField(text, pos);
    fields.push(field.value);
    pos = field.next;
    if (text[pos] !== COMMA) break;
    pos += COMMA.length;
  }
  return { value: fields, next: skipLineBreak(text, pos) };
}

function readField(text: string, start: number): Scanned<string> {
  return text[start] === QUOTE ? readQuotedField(text, start) : readUnquotedField(text, start);
}

function readUnquotedField(text: string, start: number): Scanned<string> {
  let end = start;
  while (end < text.length && !isFieldEnd(text, end)) end++;
  return { value: text.slice(start, end), next: end };
}

function readQuotedField(text: string, start: number): Scanned<string> {
  let value = "";
  let pos = start + QUOTE.length;
  for (;;) {
    const quoteAt = text.indexOf(QUOTE, pos);
    if (quoteAt === -1) {
      throw new SyntaxError(`Unterminated quoted field starting at offset ${start}`);
    }
    value += text.slice(pos, quoteAt);
    if (text[quoteAt + 1] !== QUOTE) {
      return { value, next: expectFieldEnd(text, quoteAt + QUOTE.length) };
    }
    value += QUOTE;
    pos = quoteAt + ESCAPED_QUOTE_LENGTH;
  }
}

function expectFieldEnd(text: string, pos: number): number {
  if (pos < text.length && !isFieldEnd(text, pos)) {
    throw new SyntaxError(`Unexpected character after closing quote at offset ${pos}`);
  }
  return pos;
}

function isFieldEnd(text: string, pos: number): boolean {
  return text[pos] === COMMA || lineBreakLength(text, pos) > 0;
}

/** Length of the CRLF or LF line break at `pos`, or 0 if there is none. */
function lineBreakLength(text: string, pos: number): number {
  if (text[pos] === LF) return LF.length;
  if (text[pos] === CR && text[pos + 1] === LF) return CR.length + LF.length;
  return 0;
}

function skipLineBreak(text: string, pos: number): number {
  return pos + lineBreakLength(text, pos);
}
