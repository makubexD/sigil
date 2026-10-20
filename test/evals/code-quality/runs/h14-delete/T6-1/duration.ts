// Units from largest to smallest; a duration must list them in this order.
const UNITS = ['d', 'h', 'm', 's', 'ms'] as const;

const UNIT_MS: Record<(typeof UNITS)[number], number> = {
  d: 86_400_000,
  h: 3_600_000,
  m: 60_000,
  s: 1_000,
  ms: 1,
};

// `ms` must come before `m` so that `500ms` is not read as `500m` followed by `s`.
const PART = /(\d+)(ms|d|h|m|s)/y;

/**
 * Parses a duration such as `2d`, `1h30m`, `1h 5m`, `45s` or `500ms` into milliseconds.
 *
 * Each unit may appear at most once, larger units first, optionally separated by single spaces.
 * Amounts are non-negative ASCII integers.
 *
 * @param text - The duration string to parse.
 * @returns The duration in milliseconds, as a safe integer.
 * @throws {RangeError} If `text` is not a valid duration (including the empty string), or the
 *   total exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function parseDuration(text: string): number {
  let total = 0;
  let pos = 0;
  let lastUnit = -1;

  while (true) {
    PART.lastIndex = pos;
    const match = PART.exec(text);
    if (!match) throw invalid(text);

    const unit = UNITS.indexOf(match[2] as (typeof UNITS)[number]);
    if (unit <= lastUnit) throw invalid(text);
    lastUnit = unit;

    total += Number(match[1]) * UNIT_MS[UNITS[unit]];
    pos = PART.lastIndex;

    if (pos === text.length) break;
    if (text[pos] === ' ') pos++;
  }

  if (!Number.isSafeInteger(total)) {
    throw new RangeError(`Duration out of range: ${JSON.stringify(text)}`);
  }
  return total;
}

function invalid(text: string): RangeError {
  return new RangeError(`Invalid duration: ${JSON.stringify(text)}`);
}
