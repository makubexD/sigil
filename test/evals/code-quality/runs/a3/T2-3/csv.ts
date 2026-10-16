const FIELD_SEPARATOR = ',';
const QUOTE = '"';
const ESCAPED_QUOTE = '""';
const CR = '\r';
const LF = '\n';

interface Scanned<T> {
  readonly value: T;
  readonly next: number;
}

/**
 * Parses CSV text per RFC 4180.
 *
 * Records end with CRLF or LF; a trailing line break does not produce an
 * empty record. A lone CR is ordinary field data. A quote inside an unquoted
 * field is kept literally.
 *
 * @throws {SyntaxError} on an unterminated quoted field, or on any character
 *   between a closing quote and the next separator or line break.
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let pos = 0;
  while (pos < text.length) {
    const record = scanRecord(text, pos);
    records.push(record.value);
    pos = record.next;
  }
  return records;
}

function scanRecord(text: string, start: number): Scanned<string[]> {
  const fields: string[] = [];
  let pos = start;
  for (;;) {
    const field = scanField(text, pos);
    fields.push(field.value);
    pos = field.next;
    if (text[pos] !== FIELD_SEPARATOR) break;
    pos++;
  }
  return { value: fields, next: pos + lineBreakLength(text, pos) };
}

function scanField(text: string, start: number): Scanned<string> {
  const field = text[start] === QUOTE ? scanQuotedField(text, start) : scanUnquotedField(text, start);
  if (!isFieldEnd(text, field.next)) {
    throw new SyntaxError(`Unexpected character after closing quote at offset ${field.next}`);
  }
  return field;
}

function scanUnquotedField(text: string, start: number): Scanned<string> {
  let end = start;
  while (!isFieldEnd(text, end)) end++;
  return { value: text.slice(start, end), next: end };
}

/** `start` points at the opening quote; `next` is just past the closing quote. */
function scanQuotedField(text: string, start: number): Scanned<string> {
  let value = '';
  let pos = start + 1;
  for (;;) {
    const quoteAt = text.indexOf(QUOTE, pos);
    if (quoteAt === -1) {
      throw new SyntaxError(`Unterminated quoted field starting at offset ${start}`);
    }
    value += text.slice(pos, quoteAt);
    if (!text.startsWith(ESCAPED_QUOTE, quoteAt)) {
      return { value, next: quoteAt + 1 };
    }
    value += QUOTE;
    pos = quoteAt + ESCAPED_QUOTE.length;
  }
}

function isFieldEnd(text: string, pos: number): boolean {
  return pos >= text.length || text[pos] === FIELD_SEPARATOR || lineBreakLength(text, pos) > 0;
}

/** Length of the CRLF or LF line break at `pos`, or 0 if there is none. */
function lineBreakLength(text: string, pos: number): number {
  if (text[pos] === LF) return LF.length;
  if (text.startsWith(CR + LF, pos)) return (CR + LF).length;
  return 0;
}
