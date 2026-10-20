/**
 * Parses compact duration strings such as `1h30m` or `2d 4h` into milliseconds.
 *
 * @module
 */

const MS_PER_UNIT = {
  d: 86_400_000,
  h: 3_600_000,
  m: 60_000,
  s: 1_000,
  ms: 1,
} as const;

type DurationUnit = keyof typeof MS_PER_UNIT;

/** Units from largest to smallest; parts must appear in this order. */
const UNIT_ORDER: readonly DurationUnit[] = ["d", "h", "m", "s", "ms"];

// `ms` precedes `m` in the alternation so `500ms` is not read as `500m` followed by `s`.
const PART_PATTERN = /^(\d+)(ms|d|h|m|s)/;

/**
 * Parses a duration such as `2d`, `1h30m`, `1h 5m`, `45s` or `500ms` into milliseconds.
 *
 * Each part is a non-negative integer followed by a unit (`d`, `h`, `m`, `s`, `ms`). Units
 * appear at most once, largest first, optionally separated by a single space.
 *
 * @param text - The duration string.
 * @returns The total duration in milliseconds.
 * @throws {RangeError} If `text` is empty or malformed, repeats or misorders a unit, or the
 *   total exceeds `Number.MAX_SAFE_INTEGER` milliseconds.
 */
export function parseDuration(text: string): number {
  if (text === "") throw new RangeError("Invalid duration: empty string");

  let rest = text;
  let previousUnitIndex = -1;
  let totalMs = 0;

  while (rest !== "") {
    if (previousUnitIndex >= 0 && rest.startsWith(" ")) rest = rest.slice(1);

    const match = PART_PATTERN.exec(rest);
    if (!match) throw new RangeError(`Invalid duration: "${text}"`);

    const [part, amount] = match;
    // PART_PATTERN only captures keys of MS_PER_UNIT.
    const unit = match[2] as DurationUnit;
    const unitIndex = UNIT_ORDER.indexOf(unit);
    if (unitIndex <= previousUnitIndex) {
      throw new RangeError(`Invalid duration: "${text}" (unit "${unit}" repeated or out of order)`);
    }

    totalMs += Number(amount) * MS_PER_UNIT[unit];
    previousUnitIndex = unitIndex;
    rest = rest.slice(part.length);
  }

  if (!Number.isSafeInteger(totalMs)) {
    throw new RangeError(`Invalid duration: "${text}" (exceeds safe integer milliseconds)`);
  }
  return totalMs;
}
