/**
 * Parses compact duration strings such as `1h30m` or `500ms` into milliseconds.
 *
 * @module
 */

const UNIT_MS = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1_000, ms: 1 } as const;

type Unit = keyof typeof UNIT_MS;

/** Units from largest to smallest; parts must appear in this order. */
const UNIT_ORDER: readonly Unit[] = ["d", "h", "m", "s", "ms"];

// `ms` precedes `m` in the alternation so `500ms` is not read as `500m` followed by `s`.
const DURATION_SHAPE = /^\d+(?:ms|[dhms])(?: ?\d+(?:ms|[dhms]))*$/;
const DURATION_PART = /(\d+)(ms|[dhms])/g;

/**
 * Converts a duration string into a number of milliseconds.
 *
 * The input is one or more `<amount><unit>` parts, where the amount is a non-negative integer and
 * the unit is one of `d`, `h`, `m`, `s` or `ms`. Each unit appears at most once, larger units come
 * first, and parts may be separated by a single space (`2d`, `1h30m`, `1h 5m`, `500ms`).
 *
 * @param text - The duration to parse.
 * @returns The total duration in milliseconds.
 * @throws {RangeError} If the text is empty or malformed, repeats a unit, lists units out of order,
 *   or describes a duration too large to represent exactly.
 */
export function parseDuration(text: string): number {
  if (!DURATION_SHAPE.test(text)) throw new RangeError(`Invalid duration: "${text}"`);

  let total = 0;
  let previousRank = -1;
  for (const [, amount, unitText] of text.matchAll(DURATION_PART)) {
    const unit = unitText as Unit;
    const rank = UNIT_ORDER.indexOf(unit);
    if (rank <= previousRank) {
      throw new RangeError(`Invalid duration: "${text}" (units must be unique, largest first)`);
    }
    previousRank = rank;
    total += Number(amount) * UNIT_MS[unit];
  }

  if (!Number.isSafeInteger(total)) throw new RangeError(`Duration out of range: "${text}"`);
  return total;
}
