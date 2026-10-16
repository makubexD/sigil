/**
 * RFC 4180 CSV parser — turns CSV text into rows of string fields.
 *
 * @module
 */

const QUOTE = '"';
const ESCAPED_QUOTE = '""';
const COMMA = ",";
const CR = "\r";
const LF = "\n";

interface FieldResult {
  readonly value: string;
  readonly next: number;
}

interface RecordResult {
  readonly fields: string[];
  readonly next: number;
}

/**
 * Parses CSV text according to RFC 4180.
 *
 * Fields are comma-separated and may be double-quoted; inside a quoted field `""` is a literal
 * quote and commas and line breaks are kept verbatim. Records end with CRLF or LF, and a final
 * line break does not produce an extra empty record. Quotes appearing inside an unquoted field
 * are kept as literal characters.
 *
 * @param text - The full CSV document.
 * @returns One array of fields per record; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is unterminated, or its closing quote is followed by
 *   anything other than a comma, a line break, or the end of input.
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let pos = 0;
  while (pos < text.length) {
    const record = parseRecord(text, pos);
    records.push(record.fields);
    pos = record.next;
  }
  return records;
}

function parseRecord(text: string, start: number): RecordResult {
  const fields: string[] = [];
  let pos = start;
  for (;;) {
    const field = text[pos] === QUOTE ? parseQuotedField(text, pos) : parseUnquotedField(text, pos);
    fields.push(field.value);
    pos = field.next;
    if (text[pos] !== COMMA) {
      return { fields, next: skipLineBreak(text, pos) };
    }
    pos += COMMA.length;
  }
}

function parseQuotedField(text: string, start: number): FieldResult {
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
    const next = quoteAt + QUOTE.length;
    if (!isFieldEnd(text, next)) {
      throw new SyntaxError(`Unexpected character after closing quote at offset ${next}`);
    }
    return { value, next };
  }
}

function parseUnquotedField(text: string, start: number): FieldResult {
  let pos = start;
  while (!isFieldEnd(text, pos)) {
    pos++;
  }
  return { value: text.slice(start, pos), next: pos };
}

// A lone CR is field data; only CRLF or LF terminates a record.
function isFieldEnd(text: string, pos: number): boolean {
  return (
    pos >= text.length ||
    text[pos] === COMMA ||
    text[pos] === LF ||
    text.startsWith(CR + LF, pos)
  );
}

function skipLineBreak(text: string, pos: number): number {
  if (text.startsWith(CR + LF, pos)) return pos + CR.length + LF.length;
  if (text[pos] === LF) return pos + LF.length;
  return pos;
}
