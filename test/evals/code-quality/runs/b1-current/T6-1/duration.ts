/**
 * Duration parser — converts compact duration strings such as `1h30m` or `1h 5m` into milliseconds.
 *
 * @module
 */

const MS_PER_UNIT = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1_000, ms: 1 } as const;

type Unit = keyof typeof MS_PER_UNIT;

/** Largest unit first; parts must appear in this order, each at most once. */
const UNIT_ORDER: readonly Unit[] = ["d", "h", "m", "s", "ms"];

// `ms` is tried before the single letters so `500ms` is not read as `500m` plus a stray `s`.
const PART_PATTERN = /(\d+)(ms|[dhms])/g;

const DURATION_PATTERN = new RegExp(`^${PART_PATTERN.source}(?: ?${PART_PATTERN.source})*$`);

/**
 * Parses a duration string into milliseconds.
 *
 * Accepts one or more `<amount><unit>` parts, where amount is a non-negative decimal integer and
 * unit is one of `d`, `h`, `m`, `s`, `ms`. Units appear largest first, each at most once, optionally
 * separated by a single space: `2d`, `1h30m`, `1h 5m`, `45s`, `500ms`.
 *
 * @param text - The duration to parse.
 * @returns The total duration in milliseconds.
 * @throws {RangeError} If `text` is empty, malformed, has units out of order or repeated, or the
 *   total exceeds `Number.MAX_SAFE_INTEGER` milliseconds.
 */
export function parseDuration(text: string): number {
  if (!DURATION_PATTERN.test(text)) {
    throw invalidDuration(text, 'expected parts like "1h30m" using units d, h, m, s, ms');
  }
  let total = 0;
  let previousRank = -1;
  for (const [, amount, unit] of text.matchAll(PART_PATTERN)) {
    // DURATION_PATTERN has already guaranteed `unit` is one of the known units.
    const rank = UNIT_ORDER.indexOf(unit as Unit);
    if (rank <= previousRank) {
      throw invalidDuration(text, `units must appear once each, in the order ${UNIT_ORDER.join(", ")}`);
    }
    previousRank = rank;
    total += Number(amount) * MS_PER_UNIT[unit as Unit];
  }
  if (!Number.isSafeInteger(total)) {
    throw invalidDuration(text, "total exceeds the largest safely representable number of milliseconds");
  }
  return total;
}

function invalidDuration(text: string, reason: string): RangeError {
  return new RangeError(`Invalid duration ${JSON.stringify(text)}: ${reason}`);
}
