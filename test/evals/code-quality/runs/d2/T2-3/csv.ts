/**
 * RFC 4180 CSV parser.
 *
 * @module
 */

const QUOTE = '"';
const ESCAPED_QUOTE = '""';
const COMMA = ",";
const CR = "\r";
const LF = "\n";

interface FieldRead {
  readonly value: string;
  readonly end: number;
}

/**
 * Parses RFC 4180 CSV text into records of fields.
 *
 * Records end with CRLF or LF; a final line break does not produce an extra empty record.
 * A lone CR that is not followed by LF is treated as ordinary field content.
 *
 * @param text - The full CSV document.
 * @returns One array of field values per record; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is unterminated, if a closing quote is followed by
 *   anything other than a comma, line break, or end of input, or if an unquoted field contains
 *   a double quote.
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let pos = 0;

  while (pos < text.length) {
    const field = text[pos] === QUOTE ? readQuotedField(text, pos) : readUnquotedField(text, pos);
    record.push(field.value);
    pos = field.end;

    if (pos === text.length) break;

    if (text[pos] === COMMA) {
      pos += COMMA.length;
      // A trailing comma at end of input still delimits one more (empty) field.
      if (pos === text.length) record.push("");
      continue;
    }

    pos += lineBreakLength(text, pos);
    records.push(record);
    record = [];
  }

  if (record.length > 0) records.push(record);
  return records;
}

function readQuotedField(text: string, start: number): FieldRead {
  let value = "";
  let pos = start + QUOTE.length;

  for (;;) {
    const quoteIndex = text.indexOf(QUOTE, pos);
    if (quoteIndex === -1) {
      throw new SyntaxError(`Unterminated quoted field starting at offset ${start}`);
    }
    value += text.slice(pos, quoteIndex);

    if (text.startsWith(ESCAPED_QUOTE, quoteIndex)) {
      value += QUOTE;
      pos = quoteIndex + ESCAPED_QUOTE.length;
      continue;
    }

    const end = quoteIndex + QUOTE.length;
    if (end < text.length && text[end] !== COMMA && lineBreakLength(text, end) === 0) {
      throw new SyntaxError(`Unexpected character after closing quote at offset ${end}`);
    }
    return { value, end };
  }
}

function readUnquotedField(text: string, start: number): FieldRead {
  let end = start;
  while (end < text.length && text[end] !== COMMA && lineBreakLength(text, end) === 0) {
    if (text[end] === QUOTE) {
      throw new SyntaxError(`Unexpected double quote in unquoted field at offset ${end}`);
    }
    end++;
  }
  return { value: text.slice(start, end), end };
}

/** Length of the record terminator (CRLF or LF) at `pos`, or 0 if there is none. */
function lineBreakLength(text: string, pos: number): number {
  if (text[pos] === LF) return LF.length;
  if (text[pos] === CR && text[pos + 1] === LF) return CR.length + LF.length;
  return 0;
}
