/**
 * Parser for compact duration strings such as `1h30m` or `2d 4h`.
 *
 * @module
 */

const MS_PER_SECOND = 1_000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Units from largest to smallest; a part's unit must come strictly after the previous part's. */
const UNITS = [
  { symbol: "d", ms: MS_PER_DAY },
  { symbol: "h", ms: MS_PER_HOUR },
  { symbol: "m", ms: MS_PER_MINUTE },
  { symbol: "s", ms: MS_PER_SECOND },
  { symbol: "ms", ms: 1 },
] as const;

// `ms` is listed before `m` so the longer unit wins; sticky so each match must start exactly at lastIndex.
const PART_PATTERN = /(\d+)(ms|d|h|m|s)/y;
const PART_SEPARATOR = " ";

/**
 * Converts a duration string into milliseconds.
 *
 * The input is one or more `<amount><unit>` parts, where amount is a non-negative integer and unit
 * is `d`, `h`, `m`, `s` or `ms`. Each unit may appear at most once, larger units first, and parts
 * may be separated by a single space. Examples: `2d`, `1h30m`, `1h 5m`, `45s`, `500ms`.
 *
 * @param text - The duration string to parse.
 * @returns The total duration in milliseconds.
 * @throws {RangeError} If the input is empty, malformed, repeats or misorders a unit, or the total
 *   exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function parseDuration(text: string): number {
  const pattern = new RegExp(PART_PATTERN);
  let position = 0;
  let previousUnitIndex = -1;
  let totalMs = 0;

  do {
    if (position > 0 && text.startsWith(PART_SEPARATOR, position)) {
      position += PART_SEPARATOR.length;
    }

    pattern.lastIndex = position;
    const match = pattern.exec(text);
    if (match === null) {
      throw new RangeError(`Invalid duration "${text}": expected <amount><unit> at index ${position}`);
    }

    const [part, amount, symbol] = match;
    const unitIndex = UNITS.findIndex((unit) => unit.symbol === symbol);
    if (unitIndex <= previousUnitIndex) {
      throw new RangeError(`Invalid duration "${text}": unit "${symbol}" is repeated or out of order`);
    }

    totalMs += Number(amount) * UNITS[unitIndex].ms;
    previousUnitIndex = unitIndex;
    position += part.length;
  } while (position < text.length);

  if (!Number.isSafeInteger(totalMs)) {
    throw new RangeError(`Invalid duration "${text}": exceeds the maximum safe millisecond value`);
  }

  return totalMs;
}
