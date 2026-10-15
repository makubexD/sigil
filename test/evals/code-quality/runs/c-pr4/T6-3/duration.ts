/**
 * Parser for compact duration strings such as `1h30m` or `1h 5m`.
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

type Unit = keyof typeof UNIT_MILLISECONDS;

const UNITS_LARGEST_FIRST: readonly Unit[] = ['d', 'h', 'm', 's', 'ms'];

const PART_SEPARATOR = ' ';

interface DurationPart {
  readonly amount: number;
  readonly unit: Unit;
}

/**
 * Converts a duration string into milliseconds.
 *
 * The string is a sequence of `<amount><unit>` parts, where amount is a non-negative integer
 * and unit is one of `d`, `h`, `m`, `s` or `ms`. Each unit appears at most once, larger units
 * come first, and parts may be separated by a single space: `2d`, `1h30m`, `1h 5m`, `500ms`.
 *
 * @param text - The duration string to parse.
 * @returns The total duration in milliseconds.
 * @throws {RangeError} If the string is empty or malformed, repeats a unit, lists units out of
 *   order, or describes a total beyond `Number.MAX_SAFE_INTEGER` milliseconds.
 */
export function parseDuration(text: string): number {
  let previousRank = -1;
  let total = 0;
  for (const { amount, unit } of tokenize(text)) {
    const rank = UNITS_LARGEST_FIRST.indexOf(unit);
    if (rank <= previousRank) throw invalidDuration(text);
    previousRank = rank;
    total += amount * UNIT_MILLISECONDS[unit];
  }
  if (!Number.isSafeInteger(total)) throw invalidDuration(text);
  return total;
}

function tokenize(text: string): DurationPart[] {
  // Splitting on single spaces leaves an empty segment for an empty string and for any
  // leading, trailing or doubled space, all of which are rejected below.
  return text.split(PART_SEPARATOR).flatMap((segment) => tokenizeSegment(segment, text));
}

function tokenizeSegment(segment: string, text: string): DurationPart[] {
  if (segment === '') throw invalidDuration(text);
  // `ms` precedes `m` so that `500ms` is not read as minutes followed by a stray `s`.
  const partPattern = /(\d+)(ms|d|h|m|s)/y;
  const parts: DurationPart[] = [];
  while (partPattern.lastIndex < segment.length) {
    const match = partPattern.exec(segment);
    if (match === null) throw invalidDuration(text);
    parts.push({ amount: Number(match[1]), unit: match[2] as Unit });
  }
  return parts;
}

function invalidDuration(text: string): RangeError {
  return new RangeError(`Invalid duration: ${JSON.stringify(text)}`);
}
