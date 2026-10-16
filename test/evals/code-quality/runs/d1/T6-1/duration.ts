/**
 * Parses compact duration strings such as `1h30m` or `1h 5m` into milliseconds.
 *
 * @module
 */

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Milliseconds per unit, listed in the order units must appear: largest first. */
const UNIT_MS = { d: MS_PER_DAY, h: MS_PER_HOUR, m: MS_PER_MINUTE, s: MS_PER_SECOND, ms: 1 } as const;
type Unit = keyof typeof UNIT_MS;
const UNIT_ORDER = Object.keys(UNIT_MS) as readonly Unit[];

// `ms` precedes `m` so that `500ms` is not read as `500m` followed by a stray `s`.
const PART_PATTERN = /^(?<amount>\d+)(?<unit>ms|d|h|m|s)/;
const PART_SEPARATOR = " ";

interface DurationPart {
  readonly amount: number;
  readonly unit: Unit;
}

/**
 * Converts a duration string into milliseconds.
 *
 * The string is one or more `<amount><unit>` parts, where the amount is a non-negative integer
 * and the unit is `d`, `h`, `m`, `s` or `ms`. Each unit appears at most once, larger units come
 * first, and parts may be separated by a single space. Examples: `2d`, `1h30m`, `1h 5m`, `500ms`.
 *
 * @param text - The duration string to parse.
 * @returns The total duration in milliseconds.
 * @throws {RangeError} If `text` is empty or does not match the grammar above, or if the total
 *   exceeds `Number.MAX_SAFE_INTEGER` milliseconds.
 */
export function parseDuration(text: string): number {
  const parts = readParts(text);
  assertLargestUnitsFirst(parts, text);

  const totalMs = parts.reduce((sum, { amount, unit }) => sum + amount * UNIT_MS[unit], 0);
  if (!Number.isSafeInteger(totalMs)) {
    throw new RangeError(`Duration is too large to represent exactly: ${JSON.stringify(text)}`);
  }
  return totalMs;
}

/** Splits `text` into its parts, rejecting anything that is not parts joined by optional single spaces. */
function readParts(text: string): DurationPart[] {
  const parts: DurationPart[] = [];
  let position = 0;

  do {
    if (parts.length > 0 && text.startsWith(PART_SEPARATOR, position)) {
      position += PART_SEPARATOR.length;
    }
    const groups = PART_PATTERN.exec(text.slice(position))?.groups;
    if (groups === undefined) throw invalidDuration(text);

    const { amount, unit } = groups as { amount: string; unit: Unit };
    parts.push({ amount: Number(amount), unit });
    position += amount.length + unit.length;
  } while (position < text.length);

  return parts;
}

/** Strictly decreasing unit size also rules out a repeated unit. */
function assertLargestUnitsFirst(parts: readonly DurationPart[], text: string): void {
  const unitIndexes = parts.map(({ unit }) => UNIT_ORDER.indexOf(unit));
  const isStrictlyDecreasing = unitIndexes.every((index, i) => i === 0 || index > unitIndexes[i - 1]);
  if (!isStrictlyDecreasing) throw invalidDuration(text);
}

function invalidDuration(text: string): RangeError {
  return new RangeError(`Invalid duration: ${JSON.stringify(text)}`);
}
