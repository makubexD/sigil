/**
 * Parser for compact duration strings such as `1h30m` or `1h 5m`.
 *
 * @module
 */

const MS_PER_SECOND = 1_000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Units ordered largest first; a unit's index is its rank for ordering checks. */
const UNITS = [
  ["d", MS_PER_DAY],
  ["h", MS_PER_HOUR],
  ["m", MS_PER_MINUTE],
  ["s", MS_PER_SECOND],
  ["ms", 1],
] as const;

// `ms` precedes `m` so the alternation never splits "500ms" into minutes plus a stray "s".
const PART_PATTERN = "([0-9]+)(ms|d|h|m|s)";
const PART_SEPARATOR = " ";

/**
 * Parses a duration string into milliseconds.
 *
 * The input is one or more `<amount><unit>` parts, where amount is a non-negative integer and
 * unit is one of `d`, `h`, `m`, `s`, `ms`. Each unit appears at most once, larger units come
 * first, and parts may be separated by a single space. Examples: `2d`, `1h30m`, `1h 5m`, `500ms`.
 *
 * @param text - The duration string to parse.
 * @returns The total duration in milliseconds.
 * @throws {RangeError} If the input is empty, malformed, repeats or misorders units, or the
 *   total exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function parseDuration(text: string): number {
  if (text === "") throw invalidDuration(text);

  // Sticky regexes carry lastIndex state, so build one per call rather than sharing a module-level instance.
  const part = new RegExp(PART_PATTERN, "y");
  let index = 0;
  let previousRank = -1;
  let total = 0;

  while (index < text.length) {
    if (index > 0 && text[index] === PART_SEPARATOR) index += 1;

    part.lastIndex = index;
    const match = part.exec(text);
    if (match === null) throw invalidDuration(text);

    const [whole, amount, unit] = match;
    const rank = UNITS.findIndex(([symbol]) => symbol === unit);
    if (rank <= previousRank) throw invalidDuration(text);

    const [, msPerUnit] = UNITS[rank];
    total += Number(amount) * msPerUnit;
    previousRank = rank;
    index += whole.length;
  }

  if (!Number.isSafeInteger(total)) throw invalidDuration(text);
  return total;
}

function invalidDuration(text: string): RangeError {
  return new RangeError(`Invalid duration: ${JSON.stringify(text)}`);
}
