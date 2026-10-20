const MS_PER_SECOND = 1_000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

// Largest unit first: a part's unit must appear later in this list than the previous part's.
const UNITS: ReadonlyArray<{ readonly symbol: string; readonly ms: number }> = [
  { symbol: 'd', ms: MS_PER_DAY },
  { symbol: 'h', ms: MS_PER_HOUR },
  { symbol: 'm', ms: MS_PER_MINUTE },
  { symbol: 's', ms: MS_PER_SECOND },
  { symbol: 'ms', ms: 1 },
];

// No g/y flag, so the regex carries no lastIndex state between calls.
// `ms` precedes `m` in the alternation so "500ms" isn't read as "500m" followed by "s".
const LEADING_PART = /^(\d+)(ms|d|h|m|s)/;

const PART_SEPARATOR = ' ';

/**
 * Parses a compact duration such as `2d`, `1h30m`, `1h 5m`, `45s` or `500ms`.
 *
 * Each part is a non-negative integer followed by a unit (`d`, `h`, `m`, `s`, `ms`). Units appear
 * at most once, largest first, and parts may be separated by a single space.
 *
 * @param text - The duration string.
 * @returns The duration in milliseconds.
 * @throws {RangeError} If `text` is empty or malformed, or the result is not a safe integer.
 */
export function parseDuration(text: string): number {
  let rest = text;
  let previousUnitIndex = -1;
  let totalMs = 0;

  while (true) {
    const match = LEADING_PART.exec(rest);
    if (match === null) {
      throw new RangeError(`Invalid duration: ${JSON.stringify(text)}`);
    }
    const [part, amount, symbol] = match;
    const unitIndex = UNITS.findIndex((unit) => unit.symbol === symbol);
    if (unitIndex <= previousUnitIndex) {
      throw new RangeError(`Invalid duration: ${JSON.stringify(text)}`);
    }
    previousUnitIndex = unitIndex;
    totalMs += Number(amount) * UNITS[unitIndex].ms;
    rest = rest.slice(part.length);

    if (rest === '') break;
    // A trailing separator leaves `rest` empty, which the next iteration rejects.
    if (rest.startsWith(PART_SEPARATOR)) rest = rest.slice(PART_SEPARATOR.length);
  }

  if (!Number.isSafeInteger(totalMs)) {
    throw new RangeError(`Duration out of range: ${JSON.stringify(text)}`);
  }
  return totalMs;
}
