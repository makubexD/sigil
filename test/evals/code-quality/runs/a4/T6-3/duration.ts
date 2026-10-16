/**
 * Parser for compact human-written durations such as `1h30m` or `2d`.
 *
 * @module
 */

const UNIT_MS = {
  d: 86_400_000,
  h: 3_600_000,
  m: 60_000,
  s: 1_000,
  ms: 1,
} as const;

type Unit = keyof typeof UNIT_MS;

/** Units from largest to smallest; parts must follow this order. */
const UNIT_ORDER: readonly Unit[] = ["d", "h", "m", "s", "ms"];

// `ms` precedes the single-letter units so `5ms` is not read as `5m` followed by a stray `s`.
const CHUNK_PATTERN = /^(?:\d+(?:ms|[dhms]))+$/;
const PART_PATTERN = /(\d+)(ms|[dhms])/g;

interface DurationPart {
  readonly amount: number;
  readonly unit: Unit;
}

/**
 * Converts a duration string to milliseconds.
 *
 * Accepted form: one or more `<integer><unit>` parts with units `d`, `h`, `m`, `s`, `ms`. Each unit
 * appears at most once, larger units first, optionally separated by a single space
 * (e.g. `2d`, `1h30m`, `1h 5m`, `500ms`).
 *
 * @param text - The duration to parse.
 * @returns The total duration in milliseconds.
 * @throws {RangeError} If `text` is empty, malformed, repeats or misorders a unit, or the total
 *   exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function parseDuration(text: string): number {
  const parts = splitParts(text);
  assertDescendingUnits(parts, text);

  const total = parts.reduce((sum, { amount, unit }) => sum + amount * UNIT_MS[unit], 0);
  if (!Number.isSafeInteger(total)) {
    throw new RangeError(`Duration is too large: "${text}"`);
  }
  return total;
}

function splitParts(text: string): DurationPart[] {
  // Splitting on a single space turns leading, trailing or doubled spaces into empty chunks,
  // which CHUNK_PATTERN rejects.
  const chunks = text.split(" ");
  if (!chunks.every((chunk) => CHUNK_PATTERN.test(chunk))) {
    throw invalidDuration(text);
  }
  return chunks.flatMap((chunk) =>
    Array.from(chunk.matchAll(PART_PATTERN), ([, amount, unit]) => ({
      amount: Number(amount),
      unit: unit as Unit,
    })),
  );
}

function assertDescendingUnits(parts: readonly DurationPart[], text: string): void {
  let previousRank = -1;
  for (const { unit } of parts) {
    const rank = UNIT_ORDER.indexOf(unit);
    if (rank <= previousRank) {
      throw invalidDuration(text);
    }
    previousRank = rank;
  }
}

function invalidDuration(text: string): RangeError {
  return new RangeError(`Invalid duration: "${text}"`);
}
