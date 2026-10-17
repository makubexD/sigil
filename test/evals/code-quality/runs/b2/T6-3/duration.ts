// Units in the order they must appear (largest first), with their size in milliseconds.
const UNITS = [
  ['d', 86_400_000],
  ['h', 3_600_000],
  ['m', 60_000],
  ['s', 1_000],
  ['ms', 1],
] as const;

// One part: an integer amount followed by a unit. `ms` is listed before `m` so it wins.
const PART = /^(\d+)(ms|d|h|m|s)/;

/**
 * Parses a duration such as `2d`, `1h30m`, `1h 5m`, `45s` or `500ms` into milliseconds.
 *
 * Each part is a non-negative integer followed by one of `d`, `h`, `m`, `s` or `ms`. Each unit
 * may appear at most once, larger units first, with an optional single space between parts.
 *
 * @param text - The duration string; no leading, trailing or repeated spaces.
 * @returns The total duration in milliseconds.
 * @throws {RangeError} If `text` is empty, malformed, repeats or misorders a unit, or the total
 *   exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function parseDuration(text: string): number {
  if (text === '') throw new RangeError('Invalid duration: empty string');

  let rest = text;
  let nextUnit = 0;
  let total = 0;

  while (true) {
    const match = PART.exec(rest);
    if (match === null) throw new RangeError(`Invalid duration: ${JSON.stringify(text)}`);

    const [part, amount, unit] = match;
    const index = UNITS.findIndex(([name]) => name === unit);
    if (index < nextUnit) {
      throw new RangeError(`Invalid duration: ${JSON.stringify(text)} (unit "${unit}" out of order or repeated)`);
    }
    nextUnit = index + 1;
    total += Number(amount) * UNITS[index][1];

    rest = rest.slice(part.length);
    if (rest === '') break;
    if (rest.startsWith(' ')) rest = rest.slice(1);
  }

  if (!Number.isSafeInteger(total)) {
    throw new RangeError(`Invalid duration: ${JSON.stringify(text)} (too large)`);
  }
  return total;
}
