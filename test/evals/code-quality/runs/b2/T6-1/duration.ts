/**
 * Parser for compact duration strings such as `1h30m` or `2d 4h`.
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

// Largest unit first; each part must use a unit later in this list than the part before it.
const UNIT_ORDER: readonly DurationUnit[] = ["d", "h", "m", "s", "ms"];

// `ms` precedes `m` so the alternation never splits `ms` into `m` + a stray `s`.
// The optional trailing space is only accepted when another part follows (checked below).
const PART_PATTERN = /^(\d+)(ms|d|h|m|s)( ?)/;

/**
 * Converts a duration string into milliseconds.
 *
 * Accepts one or more `<amount><unit>` parts, where amount is a non-negative integer and unit is
 * one of `d`, `h`, `m`, `s`, `ms`. Each unit may appear at most once, in descending size order,
 * optionally separated by a single space. Examples: `2d`, `1h30m`, `1h 5m`, `45s`, `500ms`.
 *
 * @param text - The duration string to parse.
 * @returns The total duration in milliseconds.
 * @throws {RangeError} If `text` is empty, malformed, repeats or misorders a unit, or the total
 *   exceeds `Number.MAX_SAFE_INTEGER` milliseconds.
 */
export function parseDuration(text: string): number {
  if (text === "") throw new RangeError("Invalid duration: empty string");

  let totalMs = 0;
  let previousUnitRank = -1;
  let position = 0;

  while (position < text.length) {
    const match = PART_PATTERN.exec(text.slice(position));
    if (match === null) throw invalidDuration(text);

    const [part, amountText, unitText, separator] = match;
    const unit = unitText as DurationUnit;
    const unitRank = UNIT_ORDER.indexOf(unit);
    if (unitRank <= previousUnitRank) throw invalidDuration(text);

    position += part.length;
    if (separator !== "" && position === text.length) throw invalidDuration(text);

    totalMs += Number(amountText) * MS_PER_UNIT[unit];
    previousUnitRank = unitRank;
  }

  if (!Number.isSafeInteger(totalMs)) {
    throw new RangeError(`Duration out of range: "${text}"`);
  }
  return totalMs;
}

function invalidDuration(text: string): RangeError {
  return new RangeError(`Invalid duration: "${text}"`);
}
