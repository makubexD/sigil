const UNIT_MS = {
  d: 86_400_000,
  h: 3_600_000,
  m: 60_000,
  s: 1_000,
  ms: 1,
} as const;

type Unit = keyof typeof UNIT_MS;

/** Units from largest to smallest; parts must appear in this order. */
const UNIT_ORDER: ReadonlyArray<Unit> = ["d", "h", "m", "s", "ms"];

/** Sticky so each part must start exactly where the previous one ended. `ms` precedes `m`. */
const PART_PATTERN = /(\d+)(ms|d|h|m|s)/y;

const PART_SEPARATOR = " ";

interface DurationPart {
  readonly amount: number;
  readonly unit: Unit;
}

/**
 * Parses a compact duration such as `2d`, `1h30m`, `1h 5m`, `45s` or `500ms` into milliseconds.
 *
 * @throws {RangeError} if the text is empty, malformed, repeats a unit, lists units out of
 *   order, or the total exceeds `Number.MAX_SAFE_INTEGER`.
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
  const parts: DurationPart[] = [];
  let position = 0;
  for (;;) {
    PART_PATTERN.lastIndex = position;
    const match = PART_PATTERN.exec(text);
    if (match === null) {
      throw new RangeError(`Invalid duration: "${text}"`);
    }
    parts.push({ amount: Number(match[1]), unit: match[2] as Unit });
    position = PART_PATTERN.lastIndex;
    if (position === text.length) {
      return parts;
    }
    // Skip one separator; a second space or a trailing one then fails the next match.
    if (text[position] === PART_SEPARATOR) {
      position += 1;
    }
  }
}

function assertDescendingUnits(parts: ReadonlyArray<DurationPart>, text: string): void {
  for (let i = 1; i < parts.length; i++) {
    const previous = UNIT_ORDER.indexOf(parts[i - 1].unit);
    if (UNIT_ORDER.indexOf(parts[i].unit) <= previous) {
      throw new RangeError(`Units must be unique and in descending order: "${text}"`);
    }
  }
}
