const MS_PER_SECOND = 1_000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Milliseconds per unit, in the order the units must appear (`d`, `h`, `m`, `s`, `ms`). */
const UNIT_MS: readonly number[] = [MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND, 1];

// Each unit is an optional group, in descending order, that may carry one trailing space; the
// final lookbehind rejects a trailing space. `ms` is last, so `1ms` cannot be read as `1m` + `s`.
const DURATION_PATTERN = /^(?:(\d+)d ?)?(?:(\d+)h ?)?(?:(\d+)m ?)?(?:(\d+)s ?)?(?:(\d+)ms)?(?<! )$/;

/**
 * Parses a compact duration such as `2d`, `1h30m`, `1h 5m`, `45s` or `500ms`.
 *
 * Units are `d`, `h`, `m`, `s` and `ms`; each appears at most once, larger units first,
 * optionally separated by a single space. Amounts are non-negative integers.
 *
 * @param text - The duration string.
 * @returns The duration in milliseconds.
 * @throws {RangeError} If `text` is empty, malformed, or the total exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function parseDuration(text: string): number {
  const match = DURATION_PATTERN.exec(text);
  if (text === "" || match === null) {
    throw new RangeError(`Invalid duration: ${JSON.stringify(text)}`);
  }

  const amounts = match.slice(1);
  const total = amounts.reduce((sum, amount, i) => sum + Number(amount ?? 0) * UNIT_MS[i], 0);
  if (!Number.isSafeInteger(total)) {
    throw new RangeError(`Duration too large: ${JSON.stringify(text)}`);
  }
  return total;
}
