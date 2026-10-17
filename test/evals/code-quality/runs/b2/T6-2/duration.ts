/**
 * Units from largest to smallest, with their size in milliseconds. A duration must list its units
 * in this order.
 */
const UNITS = [
  ['d', 86_400_000],
  ['h', 3_600_000],
  ['m', 60_000],
  ['s', 1_000],
  ['ms', 1],
] as const;

// Anchored and non-global, so it carries no lastIndex state between calls.
// `ms` must precede `m` so `500ms` is not read as `500m` followed by a stray `s`.
const LEADING_PART = /^(\d+)(ms|d|h|m|s)/;

const PART_SEPARATOR = ' ';

/**
 * Parses a duration such as `2d`, `1h30m`, `1h 5m`, `45s` or `500ms` into milliseconds.
 *
 * Units are `d`, `h`, `m`, `s` and `ms`. Each may appear at most once, larger units first, and
 * parts may be separated by a single space. Amounts are non-negative ASCII integers.
 *
 * @param text - The duration to parse.
 * @returns The total duration in milliseconds, always a safe integer.
 * @throws {RangeError} If `text` is empty, malformed, repeats or misorders a unit, or the total
 *   exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function parseDuration(text: string): number {
  if (text === '') throw new RangeError('Invalid duration: empty string');

  let rest = text;
  let lastRank = -1;
  let totalMs = 0;

  while (rest !== '') {
    if (lastRank >= 0 && rest.startsWith(PART_SEPARATOR)) rest = rest.slice(PART_SEPARATOR.length);

    const match = LEADING_PART.exec(rest);
    if (!match) throw new RangeError(`Invalid duration: ${JSON.stringify(text)}`);

    const [part, amount, unit] = match;
    const rank = UNITS.findIndex(([name]) => name === unit);
    if (rank <= lastRank) {
      throw new RangeError(
        `Invalid duration: ${JSON.stringify(text)} (units must be unique and largest first)`,
      );
    }

    totalMs += Number(amount) * UNITS[rank][1];
    lastRank = rank;
    rest = rest.slice(part.length);
  }

  if (!Number.isSafeInteger(totalMs)) {
    throw new RangeError(`Duration out of range: ${JSON.stringify(text)}`);
  }
  return totalMs;
}
