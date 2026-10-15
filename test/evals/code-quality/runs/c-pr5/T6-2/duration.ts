/**
 * Parser for compact human-written durations such as `1h30m` or `2d`.
 *
 * @module
 */

/** Milliseconds per unit, listed largest first; key order defines the required part order. */
const UNIT_MS = {
  d: 86_400_000,
  h: 3_600_000,
  m: 60_000,
  s: 1_000,
  ms: 1,
} as const;

type Unit = keyof typeof UNIT_MS;

const UNIT_ORDER = Object.keys(UNIT_MS) as readonly Unit[];

// `ms` precedes `m` and `s` so that `500ms` is not read as `500m` followed by a stray `s`.
const UNIT_PATTERN = 'ms|d|h|m|s';
const DURATION_SHAPE = new RegExp(`^\\d+(?:${UNIT_PATTERN})(?: ?\\d+(?:${UNIT_PATTERN}))*$`);
const PART_PATTERN = new RegExp(`(\\d+)(${UNIT_PATTERN})`, 'g');

/**
 * Parses a duration string into milliseconds.
 *
 * Accepts one or more `<amount><unit>` parts, where amount is a non-negative integer and unit is
 * `d`, `h`, `m`, `s` or `ms`. Each unit may appear at most once, larger units first, and parts may
 * be separated by a single space (e.g. `2d`, `1h30m`, `1h 5m`, `500ms`).
 *
 * @param text - The duration to parse.
 * @returns The total duration in milliseconds.
 * @throws {RangeError} If `text` is empty, malformed, repeats or misorders a unit, or the total
 *   exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function parseDuration(text: string): number {
  if (!DURATION_SHAPE.test(text)) {
    throw new RangeError(`Invalid duration: ${JSON.stringify(text)}`);
  }

  let total = 0;
  let previousRank = -1;
  for (const [, amount, unit] of text.matchAll(PART_PATTERN)) {
    const rank = UNIT_ORDER.indexOf(unit as Unit);
    if (rank <= previousRank) {
      throw new RangeError(`Duration units must be unique and largest first: ${JSON.stringify(text)}`);
    }
    previousRank = rank;
    total += Number(amount) * UNIT_MS[unit as Unit];
  }

  if (!Number.isSafeInteger(total)) {
    throw new RangeError(`Duration is too large: ${JSON.stringify(text)}`);
  }
  return total;
}
