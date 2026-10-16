const COMMA = ',';
const QUOTE = '"';
const CR = '\r';
const LF = '\n';

interface FieldResult {
  readonly value: string;
  readonly next: number;
}

interface RecordResult {
  readonly record: string[];
  readonly next: number;
}

/**
 * Parses RFC 4180 CSV text into records of string fields.
 *
 * Records end with CRLF or LF; a trailing line break does not add an empty record.
 * A lone CR outside a quoted field is kept as field data.
 *
 * @throws {SyntaxError} on an unterminated quoted field, or on characters between a
 *   closing quote and the next comma or line break.
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let pos = 0;
  while (pos < text.length) {
    const { record, next } = readRecord(text, pos);
    records.push(record);
    pos = next;
  }
  return records;
}

function readRecord(text: string, start: number): RecordResult {
  const record: string[] = [];
  let pos = start;
  for (;;) {
    const { value, next } = text[pos] === QUOTE ? readQuotedField(text, pos) : readPlainField(text, pos);
    record.push(value);
    if (text[next] !== COMMA) {
      return { record, next: next + lineBreakLength(text, next) };
    }
    pos = next + 1;
  }
}

function readPlainField(text: string, start: number): FieldResult {
  let pos = start;
  while (pos < text.length && text[pos] !== COMMA && lineBreakLength(text, pos) === 0) {
    pos++;
  }
  return { value: text.slice(start, pos), next: pos };
}

function readQuotedField(text: string, openingQuote: number): FieldResult {
  let value = '';
  let pos = openingQuote + 1;
  for (;;) {
    const quote = text.indexOf(QUOTE, pos);
    if (quote === -1) {
      throw new SyntaxError(`Unterminated quoted field starting at offset ${openingQuote}`);
    }
    value += text.slice(pos, quote);
    if (text[quote + 1] !== QUOTE) {
      return { value, next: assertFieldEnd(text, quote + 1) };
    }
    value += QUOTE;
    pos = quote + 2;
  }
}

function assertFieldEnd(text: string, pos: number): number {
  const atFieldEnd = pos >= text.length || text[pos] === COMMA || lineBreakLength(text, pos) > 0;
  if (!atFieldEnd) {
    throw new SyntaxError(`Unexpected character after closing quote at offset ${pos}`);
  }
  return pos;
}

function lineBreakLength(text: string, pos: number): number {
  if (text[pos] === LF) return 1;
  if (text[pos] === CR && text[pos + 1] === LF) return 2;
  return 0;
}
