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

// `ms` precedes `m` in the alternation so that `500ms` is never read as `500m` + `s`.
const DURATION_PATTERN = /^\d+(?:ms|d|h|m|s)(?: ?\d+(?:ms|d|h|m|s))*$/;
const PART_PATTERN = /(\d+)(ms|d|h|m|s)/g;

/**
 * Parses a duration string into milliseconds.
 *
 * The input is one or more `<amount><unit>` parts, where amount is a non-negative
 * integer and unit is one of `d`, `h`, `m`, `s`, `ms`. Each unit appears at most once,
 * larger units come first, and parts may be separated by a single space.
 *
 * @param text - Duration such as `2d`, `1h30m`, `1h 5m`, `45s` or `500ms`.
 * @returns Total duration in milliseconds.
 * @throws {RangeError} If the text is empty, malformed, repeats or misorders units,
 *   or the total exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function parseDuration(text: string): number {
  if (!DURATION_PATTERN.test(text)) throw invalidDuration(text);
  let previousUnitMs = Infinity;
  let totalMs = 0;
  for (const [, amount, unit] of text.matchAll(PART_PATTERN)) {
    const unitMs = MS_PER_UNIT[unit as DurationUnit];
    // Strictly decreasing unit size enforces both "larger first" and "at most once".
    if (unitMs >= previousUnitMs) throw invalidDuration(text);
    totalMs += Number(amount) * unitMs;
    previousUnitMs = unitMs;
  }
  if (!Number.isSafeInteger(totalMs)) throw invalidDuration(text);
  return totalMs;
}

function invalidDuration(text: string): RangeError {
  return new RangeError(`Invalid duration: ${JSON.stringify(text)}`);
}
