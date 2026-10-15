/**
 * RFC 4180 CSV parser.
 *
 * @module
 */

const QUOTE = '"';
const ESCAPED_QUOTE = '""';
const COMMA = ',';
const CRLF = '\r\n';
const LF = '\n';

interface Scanned<T> {
  readonly value: T;
  readonly next: number;
}

/**
 * Parses CSV text into records of string fields, following RFC 4180.
 *
 * Fields are comma-separated and may be double-quoted; inside a quoted field `""` is a literal
 * quote, and commas and line breaks are kept verbatim. Records end with CRLF or LF; a lone CR is
 * ordinary field content. A trailing line break does not produce an extra empty record.
 *
 * @param text - The full CSV document.
 * @returns One array of fields per record; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is unterminated, or a closing quote is followed by
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

function readRecord(text: string, start: number): Scanned<string[]> {
  const fields: string[] = [];
  let pos = start;
  for (;;) {
    const field = readField(text, pos);
    fields.push(field.value);
    pos = field.next;
    if (text.startsWith(COMMA, pos)) {
      pos += COMMA.length;
      continue;
    }
    return { value: fields, next: pos + lineBreakLength(text, pos) };
  }
}

function readField(text: string, start: number): Scanned<string> {
  const field = text.startsWith(QUOTE, start)
    ? readQuotedField(text, start)
    : readUnquotedField(text, start);
  if (!isFieldEnd(text, field.next)) {
    throw new SyntaxError(`Unexpected character after quoted field at offset ${field.next}`);
  }
  return field;
}

function readUnquotedField(text: string, start: number): Scanned<string> {
  let end = start;
  while (!isFieldEnd(text, end)) {
    end++;
  }
  return { value: text.slice(start, end), next: end };
}

function readQuotedField(text: string, start: number): Scanned<string> {
  let value = '';
  let pos = start + QUOTE.length;
  for (;;) {
    const quoteAt = text.indexOf(QUOTE, pos);
    if (quoteAt === -1) {
      throw new SyntaxError(`Unterminated quoted field starting at offset ${start}`);
    }
    value += text.slice(pos, quoteAt);
    if (!text.startsWith(ESCAPED_QUOTE, quoteAt)) {
      return { value, next: quoteAt + QUOTE.length };
    }
    value += QUOTE;
    pos = quoteAt + ESCAPED_QUOTE.length;
  }
}

function isFieldEnd(text: string, pos: number): boolean {
  return pos >= text.length || text.startsWith(COMMA, pos) || lineBreakLength(text, pos) > 0;
}

function lineBreakLength(text: string, pos: number): number {
  if (text.startsWith(CRLF, pos)) return CRLF.length;
  if (text.startsWith(LF, pos)) return LF.length;
  return 0;
}
