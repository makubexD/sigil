/**
 * Duration parser — converts compact strings such as `1h30m` or `1h 5m` into milliseconds.
 *
 * @module
 */

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Units in required order, largest first; the index is the unit's rank. */
const UNITS = [
  { symbol: "d", ms: MS_PER_DAY },
  { symbol: "h", ms: MS_PER_HOUR },
  { symbol: "m", ms: MS_PER_MINUTE },
  { symbol: "s", ms: MS_PER_SECOND },
  { symbol: "ms", ms: 1 },
] as const;

// `ms` must precede `m` so the longer unit wins.
const PART_SOURCE = String.raw`(\d+)(ms|d|h|m|s)`;
const PART_SEPARATOR = " ";

/**
 * Parses a duration string into milliseconds.
 *
 * Accepts one or more `<amount><unit>` parts, where amount is a non-negative integer and unit is
 * one of `d`, `h`, `m`, `s`, `ms`. Each unit may appear at most once, in descending order of size,
 * optionally separated by a single space. Examples: `2d`, `1h30m`, `1h 5m`, `45s`, `500ms`.
 *
 * @param text - The duration string to parse.
 * @returns The total duration in milliseconds.
 * @throws {RangeError} If `text` is empty, malformed, repeats or misorders a unit, or the total
 *   exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function parseDuration(text: string): number {
  if (text.length === 0) {
    throw new RangeError("Invalid duration: empty string");
  }

  // Sticky regex anchors each match at lastIndex; created per call because lastIndex is mutable.
  const partPattern = new RegExp(PART_SOURCE, "y");
  let position = 0;
  let previousRank = -1;
  let totalMs = 0;

  while (position < text.length) {
    if (position > 0 && text[position] === PART_SEPARATOR) {
      position += 1;
    }

    partPattern.lastIndex = position;
    const match = partPattern.exec(text);
    if (match === null) {
      throw new RangeError(`Invalid duration "${text}": unexpected input at position ${position}`);
    }

    const [part, amount, symbol] = match;
    const rank = UNITS.findIndex((unit) => unit.symbol === symbol);
    if (rank <= previousRank) {
      throw new RangeError(`Invalid duration "${text}": unit "${symbol}" is repeated or out of order`);
    }

    totalMs += Number(amount) * UNITS[rank].ms;
    previousRank = rank;
    position += part.length;
  }

  if (!Number.isSafeInteger(totalMs)) {
    throw new RangeError(`Invalid duration "${text}": exceeds the maximum safe integer`);
  }
  return totalMs;
}
