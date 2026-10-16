const QUOTE = '"';
const ESCAPED_QUOTE = '""';
const COMMA = ',';
const LF = '\n';
const CRLF = '\r\n';

interface ParsedField {
  readonly value: string;
  readonly next: number;
}

interface ParsedRecord {
  readonly fields: string[];
  readonly next: number;
}

/**
 * Parses RFC 4180 CSV text into records of fields.
 *
 * Records end with CRLF or LF; a trailing line break does not produce an empty record.
 * A lone CR is treated as field data, not as a record separator.
 *
 * @throws {SyntaxError} on an unterminated quoted field, or on text after a closing quote.
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let position = 0;
  while (position < text.length) {
    const record = parseRecord(text, position);
    records.push(record.fields);
    position = record.next;
  }
  return records;
}

function parseRecord(text: string, start: number): ParsedRecord {
  const fields: string[] = [];
  let position = start;
  for (;;) {
    const field = parseField(text, position);
    fields.push(field.value);
    position = field.next;
    if (!text.startsWith(COMMA, position)) {
      return { fields, next: position + lineBreakLength(text, position) };
    }
    position += COMMA.length;
  }
}

function parseField(text: string, start: number): ParsedField {
  return text.startsWith(QUOTE, start) ? parseQuotedField(text, start) : parseUnquotedField(text, start);
}

function parseUnquotedField(text: string, start: number): ParsedField {
  let position = start;
  while (position < text.length && !isFieldEnd(text, position)) {
    position++;
  }
  return { value: text.slice(start, position), next: position };
}

function parseQuotedField(text: string, start: number): ParsedField {
  let value = '';
  let position = start + QUOTE.length;
  for (;;) {
    const quoteIndex = text.indexOf(QUOTE, position);
    if (quoteIndex === -1) {
      throw new SyntaxError(`Unterminated quoted field starting at offset ${start}`);
    }
    value += text.slice(position, quoteIndex);
    if (!text.startsWith(ESCAPED_QUOTE, quoteIndex)) {
      return { value, next: closingQuoteEnd(text, quoteIndex) };
    }
    value += QUOTE;
    position = quoteIndex + ESCAPED_QUOTE.length;
  }
}

function closingQuoteEnd(text: string, quoteIndex: number): number {
  const next = quoteIndex + QUOTE.length;
  if (next < text.length && !isFieldEnd(text, next)) {
    throw new SyntaxError(`Unexpected character after closing quote at offset ${next}`);
  }
  return next;
}

function isFieldEnd(text: string, position: number): boolean {
  return text.startsWith(COMMA, position) || lineBreakLength(text, position) > 0;
}

function lineBreakLength(text: string, position: number): number {
  if (text.startsWith(CRLF, position)) return CRLF.length;
  if (text.startsWith(LF, position)) return LF.length;
  return 0;
}
