const MS_PER_UNIT = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1_000, ms: 1 } as const;

type Unit = keyof typeof MS_PER_UNIT;

const UNITS_LARGEST_FIRST: readonly Unit[] = ['d', 'h', 'm', 's', 'ms'];

// `ms` precedes `m` in the alternation so `5ms` is not read as `5m` followed by a stray `s`.
const DURATION_SHAPE = /^\d+(?:ms|d|h|m|s)(?: ?\d+(?:ms|d|h|m|s))*$/;
const PART = /(\d+)(ms|d|h|m|s)/g;

/**
 * Parses a duration such as `2d`, `1h30m`, `1h 5m`, `45s` or `500ms` into milliseconds.
 *
 * Each unit may appear at most once, largest first, with at most one space between parts.
 *
 * @throws {RangeError} when the text is not a valid duration or the total exceeds
 *   `Number.MAX_SAFE_INTEGER` milliseconds.
 */
export function parseDuration(text: string): number {
  if (!DURATION_SHAPE.test(text)) throw invalidDuration(text);

  let totalMs = 0;
  let previousRank = -1;
  for (const [, amount, unitText] of text.matchAll(PART)) {
    const unit = unitText as Unit;
    const rank = UNITS_LARGEST_FIRST.indexOf(unit);
    if (rank <= previousRank) throw invalidDuration(text);
    previousRank = rank;
    totalMs += Number(amount) * MS_PER_UNIT[unit];
  }

  if (!Number.isSafeInteger(totalMs)) throw invalidDuration(text);
  return totalMs;
}

function invalidDuration(text: string): RangeError {
  return new RangeError(`Invalid duration: ${JSON.stringify(text)}`);
}
