/**
 * RFC 4180 CSV parser.
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
 * Fields are comma-separated and may be enclosed in double quotes; a quoted
 * field may contain commas and line breaks, and `""` inside it denotes a
 * literal quote. Records end with CRLF or LF. A trailing line break does not
 * produce an extra empty record.
 *
 * @param text - The CSV document.
 * @returns One array of fields per record; `[]` for empty input.
 * @throws {SyntaxError} If a quoted field is not terminated before end of input.
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (char === QUOTE && field === "") {
      const start = i;
      i++;
      for (;;) {
        if (i >= text.length) {
          throw new SyntaxError(`Unterminated quoted field starting at offset ${start}`);
        }
        if (text[i] !== QUOTE) {
          field += text[i];
          i++;
        } else if (text[i + 1] === QUOTE) {
          field += QUOTE;
          i += 2;
        } else {
          i++;
          break;
        }
      }
      continue;
    }

    if (char === COMMA) {
      record.push(field);
      field = "";
      i++;
      continue;
    }

    if (char === LF || (char === CR && text[i + 1] === LF)) {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      i += char === CR ? 2 : 1;
      continue;
    }

    field += char;
    i++;
  }

  // Input that ends with a line break has already flushed its last record.
  const endsWithLineBreak = text.endsWith(LF);
  if (text.length > 0 && !endsWithLineBreak) {
    record.push(field);
    records.push(record);
  }

  return records;
}
