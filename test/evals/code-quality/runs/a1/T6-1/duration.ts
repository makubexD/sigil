const UNIT_MS = {
  d: 86_400_000,
  h: 3_600_000,
  m: 60_000,
  s: 1_000,
  ms: 1,
} as const;

type Unit = keyof typeof UNIT_MS;

// Units from largest to smallest; a part's unit must come strictly later than the previous one.
const UNIT_ORDER = Object.keys(UNIT_MS) as Unit[];

// One part: an integer amount, a unit, and an optional single trailing space.
// `ms` is listed before `m` so "500ms" is never read as "500m" followed by "s".
const PART = /(\d+)(ms|d|h|m|s)( ?)/y;

/**
 * Parses a duration such as `2d`, `1h30m`, `1h 5m`, `45s` or `500ms` into milliseconds.
 *
 * Each part is a non-negative integer followed by one of `d`, `h`, `m`, `s`, `ms`. Each unit
 * appears at most once, larger units first, with at most one space between parts.
 *
 * @param text - The duration string.
 * @returns The total duration in milliseconds, a safe integer.
 * @throws {RangeError} If `text` is empty, malformed, repeats or misorders units, or the total
 *   exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function parseDuration(text: string): number {
  let total = 0;
  let pos = 0;
  let lastRank = -1;
  let trailingSpace = false;

  while (pos < text.length) {
    PART.lastIndex = pos;
    const match = PART.exec(text);
    if (match === null) {
      throw new RangeError(`Invalid duration: ${JSON.stringify(text)}`);
    }
    const [, amount, unit, space] = match;
    const rank = UNIT_ORDER.indexOf(unit as Unit);
    if (rank <= lastRank) {
      throw new RangeError(`Invalid duration (units out of order or repeated): ${JSON.stringify(text)}`);
    }
    total += Number(amount) * UNIT_MS[unit as Unit];
    lastRank = rank;
    trailingSpace = space === ' ';
    pos = PART.lastIndex;
  }

  if (lastRank === -1 || trailingSpace) {
    throw new RangeError(`Invalid duration: ${JSON.stringify(text)}`);
  }
  if (!Number.isSafeInteger(total)) {
    throw new RangeError(`Duration too large: ${JSON.stringify(text)}`);
  }
  return total;
}
