/**
 * Parser for compact duration strings such as `1h30m`, returning milliseconds.
 *
 * @module
 */

const MS_PER_SECOND = 1_000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Unit suffixes with their size, in the order they must appear (largest first). */
const UNITS: ReadonlyArray<readonly [suffix: string, ms: number]> = [
  ['d', MS_PER_DAY],
  ['h', MS_PER_HOUR],
  ['m', MS_PER_MINUTE],
  ['s', MS_PER_SECOND],
  ['ms', 1],
];

// `ms` precedes `m` so that "500ms" is not read as "500m" followed by a stray "s".
const PART_SOURCE = String.raw`(\d+)(ms|d|h|m|s)`;

interface Part {
  readonly amount: number;
  readonly unitIndex: number;
  readonly end: number;
}

/**
 * Parses a duration such as `2d`, `1h30m`, `1h 5m`, `45s` or `500ms` into milliseconds.
 *
 * Units are `d`, `h`, `m`, `s` and `ms`. Each unit may appear at most once, larger units first,
 * with an optional single space between parts. Amounts are non-negative integers.
 *
 * @param text - The duration string.
 * @returns The total duration in milliseconds, always a safe integer.
 * @throws {RangeError} If `text` is empty, malformed, repeats or misorders a unit, or the total
 *   exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function parseDuration(text: string): number {
  // A fresh sticky regex per call keeps `lastIndex` state local to this parse.
  const partPattern = new RegExp(PART_SOURCE, 'y');
  let position = 0;
  let previousUnitIndex = -1;
  let total = 0;

  do {
    if (position > 0 && text[position] === ' ') position++;
    const part = readPart(text, position, partPattern);
    if (part.unitIndex <= previousUnitIndex) throw invalidDuration(text);
    total += part.amount * UNITS[part.unitIndex][1];
    previousUnitIndex = part.unitIndex;
    position = part.end;
  } while (position < text.length);

  if (!Number.isSafeInteger(total)) throw new RangeError(`Duration too large: ${JSON.stringify(text)}`);
  return total;
}

/** Reads one `<amount><unit>` part starting exactly at `position`. */
function readPart(text: string, position: number, partPattern: RegExp): Part {
  partPattern.lastIndex = position;
  const match = partPattern.exec(text);
  if (match === null) throw invalidDuration(text);
  const [, amount, suffix] = match;
  return {
    amount: Number(amount),
    unitIndex: UNITS.findIndex(([unitSuffix]) => unitSuffix === suffix),
    end: partPattern.lastIndex,
  };
}

function invalidDuration(text: string): RangeError {
  return new RangeError(`Invalid duration: ${JSON.stringify(text)}`);
}
