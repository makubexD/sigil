const MS_PER_SECOND = 1_000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Units largest first; each part's unit must come strictly later here than the previous part's. */
const UNIT_SIZES_MS: ReadonlyMap<string, number> = new Map([
  ['d', MS_PER_DAY],
  ['h', MS_PER_HOUR],
  ['m', MS_PER_MINUTE],
  ['s', MS_PER_SECOND],
  ['ms', 1],
]);
const UNIT_ORDER = [...UNIT_SIZES_MS.keys()];

// `ms` is tried before `m` so that `500ms` is not read as `500m` followed by a stray `s`.
const PART_PATTERN = /(\d+)(ms|d|h|m|s)( ?)/y;

interface DurationPart {
  readonly rank: number;
  readonly milliseconds: number;
  readonly end: number;
  readonly endsWithSpace: boolean;
}

/**
 * Parses a duration such as `2d`, `1h30m`, `1h 5m`, `45s` or `500ms` into milliseconds.
 *
 * Each unit (`d`, `h`, `m`, `s`, `ms`) may appear at most once, larger units first, with an
 * optional single space between parts. Amounts are non-negative integers.
 *
 * @throws {RangeError} If `text` is not a valid duration, or the total exceeds
 *   `Number.MAX_SAFE_INTEGER` milliseconds.
 */
export function parseDuration(text: string): number {
  if (text.length === 0) throw invalidDuration(text);

  let total = 0;
  let position = 0;
  let previousRank = -1;
  let endsWithSpace = false;
  while (position < text.length) {
    const part = readPart(text, position);
    if (part.rank <= previousRank) throw invalidDuration(text);
    total += part.milliseconds;
    previousRank = part.rank;
    position = part.end;
    endsWithSpace = part.endsWithSpace;
  }

  if (endsWithSpace) throw invalidDuration(text);
  if (!Number.isSafeInteger(total)) throw new RangeError(`Duration out of range: ${JSON.stringify(text)}`);
  return total;
}

/** Reads one `<amount><unit>` part, plus an optional trailing space, starting at `position`. */
function readPart(text: string, position: number): DurationPart {
  PART_PATTERN.lastIndex = position;
  const match = PART_PATTERN.exec(text);
  if (match === null) throw invalidDuration(text);

  const [, amount, unit, space] = match;
  return {
    rank: UNIT_ORDER.indexOf(unit),
    milliseconds: Number(amount) * UNIT_SIZES_MS.get(unit)!,
    end: PART_PATTERN.lastIndex,
    endsWithSpace: space === ' ',
  };
}

function invalidDuration(text: string): RangeError {
  return new RangeError(
    `Invalid duration: ${JSON.stringify(text)} (expected e.g. "1h 30m"; units d, h, m, s, ms, each at most once, largest first)`,
  );
}
