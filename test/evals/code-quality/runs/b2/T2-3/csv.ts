const DELIMITER = ',';
const QUOTE = '"';
const ESCAPED_QUOTE = '""';
const LF = '\n';
const CRLF = '\r\n';

/**
 * Parses CSV text per RFC 4180.
 *
 * - Fields are separated by commas; records end with CRLF or LF.
 * - A field may be wrapped in double quotes, in which case it may contain commas,
 *   line breaks, and `""` (a literal quote).
 * - A line break at the very end of the input does not produce an extra empty record.
 * - A quote inside an unquoted field (e.g. `a"b`) is kept as a literal character, and a
 *   lone CR not followed by LF is ordinary field data.
 *
 * @param text - The full CSV document.
 * @returns One array of field values per record; `[]` for empty input.
 * @throws {SyntaxError} On an unterminated quoted field, or on characters between a
 *   closing quote and the next comma or line break (e.g. `"a"b`).
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  if (text.length === 0) return records;

  let record: string[] = [];
  let pos = 0;

  while (true) {
    if (text[pos] === QUOTE) {
      const { value, end } = readQuotedField(text, pos);
      if (end < text.length && !isFieldEnd(text, end)) {
        throw new SyntaxError(`Unexpected character after closing quote at offset ${end}`);
      }
      record.push(value);
      pos = end;
    } else {
      const start = pos;
      while (pos < text.length && !isFieldEnd(text, pos)) pos++;
      record.push(text.slice(start, pos));
    }

    if (pos >= text.length) {
      records.push(record);
      return records;
    }

    if (text[pos] === DELIMITER) {
      pos++;
      continue;
    }

    pos += text.startsWith(CRLF, pos) ? CRLF.length : LF.length;
    records.push(record);
    record = [];
    if (pos >= text.length) return records;
  }
}

/** True when `pos` sits on a delimiter or the start of a line break. */
function isFieldEnd(text: string, pos: number): boolean {
  return text[pos] === DELIMITER || text[pos] === LF || text.startsWith(CRLF, pos);
}

/**
 * Reads a quoted field whose opening quote is at `start`.
 * Returns the unescaped value and the offset just past the closing quote.
 */
function readQuotedField(text: string, start: number): { value: string; end: number } {
  let value = '';
  let chunkStart = start + 1;

  while (true) {
    const quotePos = text.indexOf(QUOTE, chunkStart);
    if (quotePos === -1) {
      throw new SyntaxError(`Unterminated quoted field starting at offset ${start}`);
    }
    value += text.slice(chunkStart, quotePos);
    if (!text.startsWith(ESCAPED_QUOTE, quotePos)) {
      return { value, end: quotePos + 1 };
    }
    value += QUOTE;
    chunkStart = quotePos + ESCAPED_QUOTE.length;
  }
}
