/**
 * RFC 4180 CSV parser — turns CSV text into records of string fields.
 *
 * @module
 */

const COMMA = ",";
const QUOTE = '"';
const CR = "\r";
const LF = "\n";

/** A parsed value plus the offset just past the text it consumed. */
interface ParseStep<T> {
  readonly value: T;
  readonly next: number;
}

/**
 * Parses CSV text per RFC 4180.
 *
 * Fields are comma-separated and may be double-quoted; inside a quoted field `""` is a literal
 * quote, and commas and line breaks are kept verbatim. Records end with CRLF or LF; a trailing
 * line break does not produce an empty record. A quote inside an unquoted field is kept literally.
 *
 * @param text - The CSV document.
 * @returns One array of fields per record; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is unterminated, or its closing quote is followed by
 *   anything other than a comma, a line break, or the end of input.
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

function readRecord(text: string, start: number): ParseStep<string[]> {
  const fields: string[] = [];
  let pos = start;
  for (;;) {
    const field = readField(text, pos);
    fields.push(field.value);
    pos = field.next;
    if (text[pos] !== COMMA) {
      return { value: fields, next: pos + lineBreakLength(text, pos) };
    }
    pos += COMMA.length;
  }
}

/** Reads one field; `next` lands on a comma, a line break, or the end of input. */
function readField(text: string, start: number): ParseStep<string> {
  return text[start] === QUOTE ? readQuotedField(text, start) : readUnquotedField(text, start);
}

function readUnquotedField(text: string, start: number): ParseStep<string> {
  let end = start;
  while (end < text.length && text[end] !== COMMA && lineBreakLength(text, end) === 0) {
    end += 1;
  }
  return { value: text.slice(start, end), next: end };
}

function readQuotedField(text: string, openQuote: number): ParseStep<string> {
  let value = "";
  let pos = openQuote + QUOTE.length;
  for (;;) {
    const quote = text.indexOf(QUOTE, pos);
    if (quote === -1) {
      throw new SyntaxError(`Unterminated quoted field starting at offset ${openQuote}`);
    }
    value += text.slice(pos, quote);
    if (text[quote + 1] !== QUOTE) {
      return { value, next: expectFieldEnd(text, quote + 1) };
    }
    value += QUOTE;
    pos = quote + 2 * QUOTE.length;
  }
}

function expectFieldEnd(text: string, pos: number): number {
  const atFieldEnd = pos === text.length || text[pos] === COMMA || lineBreakLength(text, pos) > 0;
  if (!atFieldEnd) {
    throw new SyntaxError(`Unexpected character after closing quote at offset ${pos}`);
  }
  return pos;
}

/** Length of the record terminator at `pos`: 2 for CRLF, 1 for LF, 0 if none. */
function lineBreakLength(text: string, pos: number): number {
  if (text[pos] === LF) return LF.length;
  if (text[pos] === CR && text[pos + 1] === LF) return CR.length + LF.length;
  return 0;
}
