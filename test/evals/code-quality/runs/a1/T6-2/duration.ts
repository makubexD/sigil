/**
 * Parsing of compact human-written durations (`1h30m`, `500ms`) into milliseconds.
 *
 * @module
 */

/** Recognised units in the order they must appear, largest first. */
const UNITS = [
  { symbol: 'd', ms: 86_400_000 },
  { symbol: 'h', ms: 3_600_000 },
  { symbol: 'm', ms: 60_000 },
  { symbol: 's', ms: 1_000 },
  { symbol: 'ms', ms: 1 },
] as const;

// One part: an optional single leading space, digits, then a unit.
// `ms` is listed before `m` so that "500ms" is not read as "500m" followed by a stray "s".
const PART_SOURCE = '( ?)(\\d+)(ms|d|h|m|s)';

/**
 * Parses a duration such as `2d`, `1h30m`, `1h 5m`, `45s` or `500ms` into milliseconds.
 *
 * Units are `d`, `h`, `m`, `s` and `ms`. Each unit may appear at most once, larger units first,
 * and parts may be separated by a single space. Amounts are non-negative decimal integers.
 *
 * @param text - The duration to parse; no leading, trailing or repeated whitespace is allowed.
 * @returns The total duration in milliseconds, always a non-negative safe integer.
 * @throws {RangeError} If `text` is empty, malformed, repeats or misorders a unit, or the total
 *   exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function parseDuration(text: string): number {
  if (text === '') {
    throw new RangeError('Invalid duration: empty string');
  }

  // Created per call because a sticky regex carries `lastIndex` state between uses.
  const part = new RegExp(PART_SOURCE, 'y');
  let total = 0;
  let lastUnitIndex = -1;

  while (part.lastIndex < text.length) {
    const atStart = part.lastIndex === 0;
    const match = part.exec(text);
    if (match === null) {
      throw new RangeError(`Invalid duration: ${JSON.stringify(text)}`);
    }

    const [, space, digits, symbol] = match;
    if (atStart && space !== '') {
      throw new RangeError(`Invalid duration: ${JSON.stringify(text)} (leading space)`);
    }
    const unitIndex = UNITS.findIndex((unit) => unit.symbol === symbol);
    if (unitIndex <= lastUnitIndex) {
      throw new RangeError(
        `Invalid duration: ${JSON.stringify(text)} (units must be unique and largest first)`,
      );
    }

    total += Number(digits) * UNITS[unitIndex].ms;
    lastUnitIndex = unitIndex;
  }

  if (!Number.isSafeInteger(total)) {
    throw new RangeError(`Invalid duration: ${JSON.stringify(text)} (too large)`);
  }
  return total;
}
