const MS_PER_SECOND = 1_000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

// Each unit is optional and appears at most once, largest first, with at most one space before
// it. `ms` is tried after `m` fails to match, so `1ms` is not read as minutes followed by `s`.
const DURATION_PATTERN = /^(?:(\d+)d)?(?: ?(\d+)h)?(?: ?(\d+)m)?(?: ?(\d+)s)?(?: ?(\d+)ms)?$/;

// The pattern alone accepts the empty string and a leading space, so require a leading digit.
const STARTS_WITH_DIGIT = /^\d/;

/**
 * Parses a compact duration such as `2d`, `1h30m`, `1h 5m`, `45s` or `500ms` into milliseconds.
 *
 * Units are `d`, `h`, `m`, `s` and `ms`. Each unit appears at most once, larger units first,
 * optionally separated by single spaces. Amounts are non-negative decimal integers.
 *
 * @param text - The duration to parse.
 * @returns The duration in milliseconds.
 * @throws {RangeError} If `text` is empty, does not follow the format, or the total exceeds
 *   `Number.MAX_SAFE_INTEGER` milliseconds.
 */
export function parseDuration(text: string): number {
  const match = STARTS_WITH_DIGIT.test(text) ? DURATION_PATTERN.exec(text) : null;
  if (match === null) {
    throw new RangeError(`Invalid duration: ${JSON.stringify(text)}`);
  }

  const [, days, hours, minutes, seconds, milliseconds] = match;
  const totalMs =
    amount(days) * MS_PER_DAY +
    amount(hours) * MS_PER_HOUR +
    amount(minutes) * MS_PER_MINUTE +
    amount(seconds) * MS_PER_SECOND +
    amount(milliseconds);

  if (!Number.isSafeInteger(totalMs)) {
    throw new RangeError(`Duration too large: ${JSON.stringify(text)}`);
  }
  return totalMs;
}

function amount(digits: string | undefined): number {
  return digits === undefined ? 0 : Number(digits);
}
