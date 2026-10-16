const MS_PER_SECOND = 1_000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

type Unit = 'd' | 'h' | 'm' | 's' | 'ms';

// Ordered largest first; a part's unit must come strictly after the previous part's.
const UNITS: readonly { unit: Unit; ms: number }[] = [
  { unit: 'd', ms: MS_PER_DAY },
  { unit: 'h', ms: MS_PER_HOUR },
  { unit: 'm', ms: MS_PER_MINUTE },
  { unit: 's', ms: MS_PER_SECOND },
  { unit: 'ms', ms: 1 },
];

// `ms` is tried before `m` so that "500ms" is not read as "500m" followed by "s".
const PART = /(\d+)(ms|d|h|m|s)/y;

/**
 * Parses a duration such as `2d`, `1h30m`, `1h 5m`, `45s` or `500ms` into milliseconds.
 *
 * The text is one or more `<amount><unit>` parts, where the amount is a non-negative decimal
 * integer and the unit is `d`, `h`, `m`, `s` or `ms`. Each unit appears at most once, larger units
 * first, and parts may be separated by a single space.
 *
 * @param text - The duration to parse.
 * @returns The total duration in milliseconds.
 * @throws {RangeError} If `text` is not a valid duration (including the empty string), or the
 *   total exceeds `Number.MAX_SAFE_INTEGER` milliseconds.
 */
export function parseDuration(text: string): number {
  let pos = 0;
  let lastRank = -1;
  let total = 0;

  do {
    if (pos > 0 && text[pos] === ' ') pos++;

    PART.lastIndex = pos;
    const match = PART.exec(text);
    if (match === null) throw invalidDuration(text);

    const rank = UNITS.findIndex(({ unit }) => unit === match[2]);
    if (rank <= lastRank) throw invalidDuration(text);

    lastRank = rank;
    total += Number(match[1]) * UNITS[rank].ms;
    pos = PART.lastIndex;
  } while (pos < text.length);

  if (!Number.isSafeInteger(total)) throw invalidDuration(text);
  return total;
}

function invalidDuration(text: string): RangeError {
  return new RangeError(`Invalid duration: ${JSON.stringify(text)}`);
}
