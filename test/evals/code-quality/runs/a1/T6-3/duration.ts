/**
 * Parsing of compact human-written durations (`1h30m`, `500ms`) into milliseconds.
 *
 * @module
 */

// Units in the order they must appear (largest first), mapped to their size in milliseconds.
const UNIT_MS: ReadonlyMap<string, number> = new Map([
  ['d', 86_400_000],
  ['h', 3_600_000],
  ['m', 60_000],
  ['s', 1_000],
  ['ms', 1],
]);
const UNIT_ORDER: ReadonlyArray<string> = [...UNIT_MS.keys()];

// One part: an integer amount followed by a unit. `ms` must precede `m` and `s` in the alternation.
const PART_PATTERN = String.raw`(\d+)(ms|d|h|m|s)`;

/**
 * Parses a duration such as `2d`, `1h30m`, `1h 5m`, `45s` or `500ms` into milliseconds.
 *
 * Units are `d`, `h`, `m`, `s` and `ms`. Each unit may appear at most once, larger units first,
 * optionally separated by single spaces. Amounts are non-negative integers.
 *
 * @param text - The duration string.
 * @returns The total duration in milliseconds.
 * @throws {RangeError} If `text` is empty, malformed, repeats or misorders a unit, or the total
 *   exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function parseDuration(text: string): number {
  // Sticky regex created per call so its `lastIndex` cursor is never shared between calls.
  const part = new RegExp(PART_PATTERN, 'y');
  let total = 0;
  let lastRank = -1;

  for (;;) {
    const match = part.exec(text);
    if (match === null) {
      throw new RangeError(`Invalid duration: ${JSON.stringify(text)}`);
    }

    const [, amount, unit] = match;
    const rank = UNIT_ORDER.indexOf(unit);
    if (rank <= lastRank) {
      throw new RangeError(
        `Invalid duration: ${JSON.stringify(text)} (each unit at most once, largest first)`,
      );
    }
    lastRank = rank;
    total += Number(amount) * (UNIT_MS.get(unit) ?? 0);

    if (part.lastIndex === text.length) break;
    // Skip one separating space; the next exec then requires a part right after it,
    // which rejects trailing, leading and repeated spaces.
    if (text[part.lastIndex] === ' ') part.lastIndex++;
  }

  if (!Number.isSafeInteger(total)) {
    throw new RangeError(`Duration out of range: ${JSON.stringify(text)}`);
  }
  return total;
}
