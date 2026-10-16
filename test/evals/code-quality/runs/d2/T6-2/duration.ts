/**
 * Duration parser — converts compact human-written durations such as `1h 30m` into milliseconds.
 *
 * @module
 */

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

// Ordered largest to smallest; a part's index here is its rank for the ordering rule.
const UNIT_MILLISECONDS: ReadonlyArray<readonly [string, number]> = [
  ["d", MS_PER_DAY],
  ["h", MS_PER_HOUR],
  ["m", MS_PER_MINUTE],
  ["s", MS_PER_SECOND],
  ["ms", 1],
];

// `ms` must come before the single letters so `500ms` is not read as `500m` followed by `s`.
const PART_PATTERN = /^(\d+)(ms|d|h|m|s)/;
const PART_SEPARATOR = " ";

/**
 * Parses a duration such as `2d`, `1h30m`, `1h 5m`, `45s` or `500ms` into milliseconds.
 *
 * Each part is a non-negative integer followed by one of `d`, `h`, `m`, `s` or `ms`. Each unit
 * may appear at most once, larger units must precede smaller ones, and adjacent parts may be
 * separated by at most one space. Leading and trailing whitespace is not allowed.
 *
 * @param text - The duration to parse.
 * @returns The total duration in milliseconds.
 * @throws {RangeError} If `text` is empty or malformed, repeats a unit, orders units from
 *   smaller to larger, or totals more than `Number.MAX_SAFE_INTEGER` milliseconds.
 */
export function parseDuration(text: string): number {
  if (text.length === 0) throw invalidDuration(text, "it is empty");

  let total = 0;
  let previousRank = -1;
  let position = 0;

  while (position < text.length) {
    if (position > 0 && text[position] === PART_SEPARATOR) position += 1;

    const match = PART_PATTERN.exec(text.slice(position));
    if (match === null) throw invalidDuration(text, `unexpected input at position ${position}`);

    const [part, amount, unit] = match;
    const rank = UNIT_MILLISECONDS.findIndex(([name]) => name === unit);
    if (rank <= previousRank) {
      throw invalidDuration(text, `unit "${unit}" is repeated or follows a smaller unit`);
    }

    const [, unitMilliseconds] = UNIT_MILLISECONDS[rank];
    total += Number(amount) * unitMilliseconds;
    previousRank = rank;
    position += part.length;
  }

  if (!Number.isSafeInteger(total)) throw invalidDuration(text, "it is too large");
  return total;
}

function invalidDuration(text: string, reason: string): RangeError {
  return new RangeError(`Invalid duration ${JSON.stringify(text)}: ${reason}`);
}
