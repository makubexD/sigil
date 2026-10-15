/**
 * Duration parsing for compact strings such as `1h30m` or `500ms`.
 *
 * @module
 */

/** Milliseconds per unit, listed largest first — the order units must appear in. */
const UNIT_MS = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1_000, ms: 1 } as const;

type Unit = keyof typeof UNIT_MS;

const UNIT_ORDER = Object.keys(UNIT_MS) as Unit[];

// `ms` must precede `m` so `500ms` isn't read as `500m` followed by a stray `s`.
const PART_SOURCE = String.raw`\d+(?:ms|d|h|m|s)`;
const DURATION_SHAPE = new RegExp(`^${PART_SOURCE}(?: ?${PART_SOURCE})*$`);
const PART = /(\d+)(ms|d|h|m|s)/g;

/**
 * Parses a duration such as `2d`, `1h30m`, `1h 5m`, `45s` or `500ms` into milliseconds.
 *
 * Units are `d`, `h`, `m`, `s` and `ms`. Each may appear at most once, larger units first,
 * optionally separated by single spaces. Amounts are non-negative integers.
 *
 * @param text - The duration string.
 * @returns The total duration in milliseconds.
 * @throws {RangeError} If `text` is empty, malformed, repeats or misorders a unit, or the total
 *   exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function parseDuration(text: string): number {
  if (typeof text !== 'string' || !DURATION_SHAPE.test(text)) {
    throw new RangeError(`Invalid duration: ${JSON.stringify(text)}`);
  }

  let total = 0;
  let previousRank = -1;
  for (const [, amount, unit] of text.matchAll(PART)) {
    const rank = UNIT_ORDER.indexOf(unit as Unit);
    if (rank <= previousRank) {
      throw new RangeError(`Invalid duration: ${JSON.stringify(text)} (units must be unique and largest first)`);
    }
    previousRank = rank;
    total += Number(amount) * UNIT_MS[unit as Unit];
  }

  if (!Number.isSafeInteger(total)) {
    throw new RangeError(`Duration out of range: ${JSON.stringify(text)}`);
  }
  return total;
}
