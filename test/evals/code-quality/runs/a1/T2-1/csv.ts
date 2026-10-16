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
 * Parses CSV text into records of string fields, following RFC 4180.
 *
 * - Fields are separated by commas; records end with CRLF or LF.
 * - A field may be enclosed in double quotes, in which case it may contain commas, CR, and LF,
 *   and `""` denotes a literal quote.
 * - A line break at the very end of the input does not produce an empty trailing record.
 * - A lone CR (not followed by LF) outside quotes is ordinary field data.
 * - A quote inside an unquoted field is ordinary field data.
 *
 * Records are not required to have the same number of fields.
 *
 * @param text - The full CSV document.
 * @returns One array of fields per record; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is never closed, or if a closing quote is followed by
 *   anything other than a comma, a line break, or the end of input.
 */
export function parseCsv(text: string): string[][] {
  if (text === "") return [];

  const records: string[][] = [];
  let record: string[] = [];
  let pos = 0;

  while (true) {
    const { value, end } =
      text[pos] === QUOTE ? readQuotedField(text, pos) : readUnquotedField(text, pos);
    record.push(value);
    pos = end;

    if (pos >= text.length) {
      records.push(record);
      return records;
    }

    if (text[pos] === COMMA) {
      pos += 1;
      continue;
    }

    // Only a line break can remain here; both readers stop on nothing else.
    pos += text[pos] === CR ? 2 : 1;
    records.push(record);
    record = [];
    if (pos >= text.length) return records;
  }
}

interface FieldResult {
  readonly value: string;
  /** Index just past the field, pointing at a comma, line break, or the end of input. */
  readonly end: number;
}

function readUnquotedField(text: string, start: number): FieldResult {
  let pos = start;
  while (pos < text.length) {
    const ch = text[pos];
    if (ch === COMMA || ch === LF) break;
    if (ch === CR && text[pos + 1] === LF) break;
    pos += 1;
  }
  return { value: text.slice(start, pos), end: pos };
}

function readQuotedField(text: string, openQuote: number): FieldResult {
  let value = "";
  let pos = openQuote + 1;

  while (true) {
    const quote = text.indexOf(QUOTE, pos);
    if (quote === -1) {
      throw new SyntaxError(`Unterminated quoted field starting at offset ${openQuote}`);
    }
    value += text.slice(pos, quote);

    if (text[quote + 1] === QUOTE) {
      value += QUOTE;
      pos = quote + 2;
      continue;
    }

    const end = quote + 1;
    if (!isFieldBoundary(text, end)) {
      throw new SyntaxError(`Unexpected character after closing quote at offset ${end}`);
    }
    return { value, end };
  }
}

function isFieldBoundary(text: string, pos: number): boolean {
  if (pos >= text.length) return true;
  const ch = text[pos];
  return ch === COMMA || ch === LF || (ch === CR && text[pos + 1] === LF);
}
