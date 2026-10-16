/**
 * Parser for compact duration strings such as `1h30m` or `2d 4h`.
 *
 * @module
 */

const MILLISECONDS_PER_UNIT = {
  d: 86_400_000,
  h: 3_600_000,
  m: 60_000,
  s: 1_000,
  ms: 1,
} as const;

type DurationUnit = keyof typeof MILLISECONDS_PER_UNIT;

const UNITS_LARGEST_FIRST: readonly DurationUnit[] = ['d', 'h', 'm', 's', 'ms'];

// `ms` must precede `m` so that `500ms` is not read as `500m` followed by a stray `s`.
const PART_SOURCE = String.raw`(\d+)(ms|d|h|m|s)`;

const PART_SEPARATOR = ' ';

interface DurationPart {
  readonly amount: number;
  readonly unit: DurationUnit;
}

/**
 * Converts a duration string into milliseconds.
 *
 * The string is one or more `<amount><unit>` parts, where amount is a non-negative integer and
 * unit is one of `d`, `h`, `m`, `s`, `ms`. Each unit appears at most once, larger units come
 * first, and parts may be separated by a single space, e.g. `2d`, `1h30m`, `1h 5m`, `500ms`.
 *
 * @param text - The duration string to parse.
 * @returns The total duration in milliseconds.
 * @throws {RangeError} If `text` is empty, malformed, repeats or misorders a unit, or the total
 *   exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function parseDuration(text: string): number {
  const parts = splitParts(text);
  assertUnitsDescend(parts, text);
  return totalMilliseconds(parts, text);
}

function splitParts(text: string): DurationPart[] {
  // A fresh sticky regex per call keeps `lastIndex` out of module-level state.
  const partPattern = new RegExp(PART_SOURCE, 'y');
  const parts: DurationPart[] = [];
  let index = 0;

  while (index < text.length) {
    if (parts.length > 0 && text[index] === PART_SEPARATOR) {
      index += 1;
    }
    partPattern.lastIndex = index;
    const match = partPattern.exec(text);
    if (match === null) {
      throw invalidDuration(text, `unexpected input at position ${index}`);
    }
    parts.push({ amount: Number(match[1]), unit: match[2] as DurationUnit });
    index = partPattern.lastIndex;
  }

  if (parts.length === 0) {
    throw invalidDuration(text, 'it is empty');
  }
  return parts;
}

function assertUnitsDescend(parts: readonly DurationPart[], text: string): void {
  let previousRank = -1;
  for (const { unit } of parts) {
    const rank = UNITS_LARGEST_FIRST.indexOf(unit);
    if (rank <= previousRank) {
      throw invalidDuration(text, `unit "${unit}" is repeated or out of order`);
    }
    previousRank = rank;
  }
}

function totalMilliseconds(parts: readonly DurationPart[], text: string): number {
  const total = parts.reduce((sum, { amount, unit }) => sum + amount * MILLISECONDS_PER_UNIT[unit], 0);
  if (!Number.isSafeInteger(total)) {
    throw invalidDuration(text, 'it is too large to represent exactly');
  }
  return total;
}

function invalidDuration(text: string, reason: string): RangeError {
  return new RangeError(`Invalid duration ${JSON.stringify(text)}: ${reason}`);
}
