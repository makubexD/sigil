/**
 * Parses compact human-written durations such as `1h30m` or `2d` into milliseconds.
 *
 * @module
 */

const UNIT_MILLISECONDS = {
  d: 86_400_000,
  h: 3_600_000,
  m: 60_000,
  s: 1_000,
  ms: 1,
} as const;

type DurationUnit = keyof typeof UNIT_MILLISECONDS;

const UNITS_LARGEST_FIRST: readonly DurationUnit[] = ["d", "h", "m", "s", "ms"];

// `ms` precedes `m` in the alternation so `500ms` is not read as `500m` followed by `s`.
const PART_PATTERN = /^(\d+)(ms|d|h|m|s)( ?)/;

/**
 * Converts a duration string into a number of milliseconds.
 *
 * The input is one or more `<amount><unit>` parts, where the amount is a non-negative integer and
 * the unit is `d`, `h`, `m`, `s` or `ms`. Each unit appears at most once, larger units come first,
 * and parts may be separated by a single space (`1h30m`, `1h 5m`).
 *
 * @param text - The duration to parse, with no leading or trailing whitespace.
 * @returns The total duration in milliseconds.
 * @throws {RangeError} If `text` is empty, malformed, repeats or misorders a unit, or exceeds
 *   `Number.MAX_SAFE_INTEGER` milliseconds.
 */
export function parseDuration(text: string): number {
  if (text === "") throw invalidDuration(text);

  let remaining = text;
  let smallestAllowedUnitIndex = 0;
  let totalMilliseconds = 0;

  while (remaining !== "") {
    const match = PART_PATTERN.exec(remaining);
    if (match === null) throw invalidDuration(text);

    const [part, amount, matchedUnit, separator] = match;
    // PART_PATTERN only captures keys of UNIT_MILLISECONDS.
    const unit = matchedUnit as DurationUnit;
    const unitIndex = UNITS_LARGEST_FIRST.indexOf(unit);
    if (unitIndex < smallestAllowedUnitIndex) throw invalidDuration(text);

    remaining = remaining.slice(part.length);
    if (separator !== "" && remaining === "") throw invalidDuration(text);

    smallestAllowedUnitIndex = unitIndex + 1;
    totalMilliseconds += Number(amount) * UNIT_MILLISECONDS[unit];
  }

  if (!Number.isSafeInteger(totalMilliseconds)) throw invalidDuration(text);
  return totalMilliseconds;
}

function invalidDuration(text: string): RangeError {
  return new RangeError(`Invalid duration: ${JSON.stringify(text)}`);
}
