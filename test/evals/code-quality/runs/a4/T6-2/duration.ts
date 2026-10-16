/** Units ordered largest first; each unit's position defines the required ordering. */
const UNIT_MS = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1_000, ms: 1 } as const;
type Unit = keyof typeof UNIT_MS;
const UNIT_ORDER = Object.keys(UNIT_MS) as Unit[];

// `ms` must precede `m` in the alternation so "500ms" isn't read as "500m" followed by "s".
const PART_PATTERN = /(\d+)(ms|d|h|m|s)/y;
const PART_SEPARATOR = ' ';

interface DurationPart {
  readonly amount: number;
  readonly unit: Unit;
  readonly end: number;
}

/**
 * Parses a duration such as `2d`, `1h30m`, `1h 5m`, `45s` or `500ms` into milliseconds.
 *
 * Each unit (`d`, `h`, `m`, `s`, `ms`) may appear at most once, largest first, with an optional
 * single space between parts. Amounts are non-negative integers.
 *
 * @param text - The duration string to parse.
 * @returns The total duration in milliseconds.
 * @throws {RangeError} If `text` is empty, malformed, repeats or misorders a unit, or the total
 *   exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function parseDuration(text: string): number {
  let position = 0;
  let previousUnitIndex = -1;
  let total = 0;

  do {
    const part = readPart(text, position);
    const unitIndex = UNIT_ORDER.indexOf(part.unit);
    if (unitIndex <= previousUnitIndex) throw invalid(text);
    previousUnitIndex = unitIndex;
    total += part.amount * UNIT_MS[part.unit];
    position = part.end;
  } while (position < text.length);

  if (!Number.isSafeInteger(total)) throw invalid(text);
  return total;
}

/** Reads one `<amount><unit>` part at `start`, skipping a single leading separator between parts. */
function readPart(text: string, start: number): DurationPart {
  const isBetweenParts = start > 0 && text[start] === PART_SEPARATOR;
  // A fresh sticky regex per call avoids sharing mutable `lastIndex` state at module scope.
  const pattern = new RegExp(PART_PATTERN);
  pattern.lastIndex = isBetweenParts ? start + 1 : start;
  const match = pattern.exec(text);
  if (match === null) throw invalid(text);
  const [whole, amount, unit] = match;
  return { amount: Number(amount), unit: unit as Unit, end: match.index + whole.length };
}

function invalid(text: string): RangeError {
  return new RangeError(`Invalid duration: ${JSON.stringify(text)}`);
}
