/** Duration units in the order they must appear, largest first. */
const UNITS = [
  { symbol: 'd', ms: 86_400_000 },
  { symbol: 'h', ms: 3_600_000 },
  { symbol: 'm', ms: 60_000 },
  { symbol: 's', ms: 1_000 },
  { symbol: 'ms', ms: 1 },
] as const;

// `ms` precedes `m` in the alternation so "500ms" is not read as "500m" followed by a stray "s".
// Global flag is only used through `matchAll`, which clones the regex, so no lastIndex is shared.
const DURATION_PART = /(\d+)(ms|d|h|m|s)( ?)/g;

/**
 * Parses a duration such as `2d`, `1h30m`, `1h 5m`, `45s` or `500ms` into milliseconds.
 *
 * Each unit (`d`, `h`, `m`, `s`, `ms`) may appear at most once, largest first, with an optional
 * single space between parts. Amounts are non-negative decimal integers.
 *
 * @param text - The duration string.
 * @returns The duration in milliseconds.
 * @throws {RangeError} If `text` is empty, malformed, repeats or misorders a unit, or the total
 *   exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function parseDuration(text: string): number {
  let total = 0;
  let cursor = 0;
  let previousRank = -1;

  for (const match of text.matchAll(DURATION_PART)) {
    const [part, amount, symbol] = match;
    const rank = UNITS.findIndex((unit) => unit.symbol === symbol);
    if (match.index !== cursor || rank <= previousRank) throw invalidDuration(text);

    total += Number(amount) * UNITS[rank].ms;
    previousRank = rank;
    cursor += part.length;
  }

  const isComplete = cursor > 0 && cursor === text.length && !text.endsWith(' ');
  if (!isComplete || !Number.isSafeInteger(total)) throw invalidDuration(text);
  return total;
}

function invalidDuration(text: string): RangeError {
  return new RangeError(`Invalid duration: ${JSON.stringify(text)}`);
}
