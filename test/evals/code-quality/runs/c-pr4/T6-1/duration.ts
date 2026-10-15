/**
 * Parses compact human-readable durations such as `1h30m` into milliseconds.
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

/** Units from largest to smallest; parts must follow this order. */
const UNIT_ORDER: readonly DurationUnit[] = ['d', 'h', 'm', 's', 'ms'];

// `ms` precedes the single-letter units so `500ms` is not read as `500m` followed by `s`.
const UNIT_PATTERN = 'ms|[dhms]';
const DURATION_SHAPE = new RegExp(`^\\d+(?:${UNIT_PATTERN})(?: ?\\d+(?:${UNIT_PATTERN}))*$`);
const DURATION_PART = new RegExp(`(\\d+)(${UNIT_PATTERN})`, 'g');

/**
 * Converts a duration string into milliseconds.
 *
 * Accepts parts of the form `<amount><unit>` with units `d`, `h`, `m`, `s` and `ms`. Each unit may
 * appear at most once, larger units must come first, and parts may be separated by a single space.
 * Amounts are non-negative integers.
 *
 * @param text - Duration such as `2d`, `1h30m`, `1h 5m`, `45s` or `500ms`.
 * @returns Total duration in milliseconds.
 * @throws {RangeError} If `text` is empty, malformed, repeats or misorders a unit, or the total
 *   exceeds `Number.MAX_SAFE_INTEGER` milliseconds.
 */
export function parseDuration(text: string): number {
  if (!DURATION_SHAPE.test(text)) throw invalidDuration(text);

  let totalMs = 0;
  let previousRank = -1;
  for (const [, amount, unit] of text.matchAll(DURATION_PART)) {
    const rank = UNIT_ORDER.indexOf(unit as DurationUnit);
    if (rank <= previousRank) throw invalidDuration(text);
    previousRank = rank;
    totalMs += Number(amount) * MS_PER_UNIT[unit as DurationUnit];
  }

  if (!Number.isSafeInteger(totalMs)) throw invalidDuration(text);
  return totalMs;
}

function invalidDuration(text: string): RangeError {
  return new RangeError(`Invalid duration: ${JSON.stringify(text)}`);
}
