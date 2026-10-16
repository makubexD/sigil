/**
 * Duration parsing — converts compact strings such as `1h30m` into milliseconds.
 *
 * @module
 */

const MS_PER_SECOND = 1_000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Units ordered largest first; parts must follow this order, each at most once. */
const UNITS = ['d', 'h', 'm', 's', 'ms'] as const;
type Unit = (typeof UNITS)[number];

const UNIT_MS: Readonly<Record<Unit, number>> = {
  d: MS_PER_DAY,
  h: MS_PER_HOUR,
  m: MS_PER_MINUTE,
  s: MS_PER_SECOND,
  ms: 1,
};

// `ms` is listed before `m` so `500ms` is not read as `500m` followed by a stray `s`.
const PART_PATTERN = /(\d+)(ms|d|h|m|s)/y;
const PART_SEPARATOR = ' ';

interface DurationPart {
  readonly unitIndex: number;
  readonly milliseconds: number;
  readonly end: number;
}

/**
 * Parses a duration such as `2d`, `1h30m`, `1h 5m`, `45s` or `500ms` into milliseconds.
 *
 * Units are `d`, `h`, `m`, `s` and `ms`. Each unit appears at most once, larger units first,
 * optionally separated by a single space. Amounts are non-negative integers.
 *
 * @param text - The duration string to parse.
 * @returns The total duration in milliseconds.
 * @throws {RangeError} If `text` is empty, malformed, or the total exceeds the safe integer range.
 */
export function parseDuration(text: string): number {
  let total = 0;
  let position = 0;
  let lastUnitIndex = -1;

  do {
    if (position > 0 && text[position] === PART_SEPARATOR) position++;
    const part = readPart(text, position);
    if (part.unitIndex <= lastUnitIndex) throw invalidDuration(text);
    total += part.milliseconds;
    lastUnitIndex = part.unitIndex;
    position = part.end;
  } while (position < text.length);

  if (!Number.isSafeInteger(total)) {
    throw new RangeError(`Duration out of range: ${JSON.stringify(text)}`);
  }
  return total;
}

/** Reads one `<amount><unit>` part starting exactly at `position`, or throws. */
function readPart(text: string, position: number): DurationPart {
  PART_PATTERN.lastIndex = position;
  const match = PART_PATTERN.exec(text);
  if (match === null) throw invalidDuration(text);

  const unit = match[2] as Unit;
  return {
    unitIndex: UNITS.indexOf(unit),
    milliseconds: Number(match[1]) * UNIT_MS[unit],
    end: PART_PATTERN.lastIndex,
  };
}

function invalidDuration(text: string): RangeError {
  return new RangeError(`Invalid duration: ${JSON.stringify(text)}`);
}
