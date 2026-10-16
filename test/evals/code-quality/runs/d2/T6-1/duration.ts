/**
 * Parses compact human-written durations such as `1h30m` or `500ms` into milliseconds.
 *
 * @module
 */

const MS_PER_SECOND = 1_000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Accepted units, largest first; the order here is the order parts must appear in. */
const UNITS = [
  ['d', MS_PER_DAY],
  ['h', MS_PER_HOUR],
  ['m', MS_PER_MINUTE],
  ['s', MS_PER_SECOND],
  ['ms', 1],
] as const;

// A single space may follow a part only when another part comes after it, which rules out
// leading, trailing, and doubled spaces. The leading lookahead rejects the empty string.
const OPTIONAL_SEPARATOR = '(?: (?=\\d))?';
const DURATION_PATTERN = new RegExp(
  `^(?=\\d)${UNITS.map(([unit]) => `(?:(\\d+)${unit}${OPTIONAL_SEPARATOR})?`).join('')}$`,
);

/**
 * Converts a duration string into a number of milliseconds.
 *
 * The input is one or more `<amount><unit>` parts, where the amount is a non-negative integer and
 * the unit is `d`, `h`, `m`, `s` or `ms`. Each unit appears at most once, larger units come first,
 * and parts may be separated by a single space: `2d`, `1h30m`, `1h 5m`, `45s`, `500ms`.
 *
 * @param text - The duration to parse.
 * @returns The total duration in milliseconds.
 * @throws {RangeError} If `text` is empty, does not follow the format above, or describes a
 *   duration too large to represent exactly as a number.
 */
export function parseDuration(text: string): number {
  const match = DURATION_PATTERN.exec(text);
  if (match === null) {
    throw new RangeError(`Invalid duration: ${JSON.stringify(text)}`);
  }

  let totalMs = 0;
  UNITS.forEach(([, unitMs], index) => {
    const amount = match[index + 1];
    if (amount !== undefined) {
      totalMs += Number(amount) * unitMs;
    }
  });

  if (!Number.isSafeInteger(totalMs)) {
    throw new RangeError(`Duration too large: ${JSON.stringify(text)}`);
  }
  return totalMs;
}
