// Units in the order they must appear (largest first), with their size in milliseconds.
const UNIT_MS = {
  d: 86_400_000,
  h: 3_600_000,
  m: 60_000,
  s: 1_000,
  ms: 1,
} as const;
type Unit = keyof typeof UNIT_MS;
const UNIT_ORDER = Object.keys(UNIT_MS) as Unit[];

// `ms` must precede `m` and `s` in the alternation so `500ms` isn't read as `500m` + `s`.
const PART_SOURCE = String.raw`(\d+)(ms|d|h|m|s)`;
const PART = new RegExp(PART_SOURCE, 'g');
// One or more parts, each pair separated by at most one space.
const WHOLE = new RegExp(String.raw`^${PART_SOURCE}(?: ?${PART_SOURCE})*$`);

/**
 * Parses a duration such as `2d`, `1h30m`, `1h 5m`, `45s` or `500ms` into milliseconds.
 * Each unit may appear at most once, larger units first, optionally separated by single spaces.
 * Throws a RangeError for anything else, including an empty string.
 */
export function parseDuration(text: string): number {
  if (!WHOLE.test(text)) throw invalid(text);

  let previousRank = -1;
  let total = 0;
  for (const [, amount, unit] of text.matchAll(PART)) {
    const rank = UNIT_ORDER.indexOf(unit as Unit);
    if (rank <= previousRank) throw invalid(text);
    previousRank = rank;
    total += Number(amount) * UNIT_MS[unit as Unit];
  }

  if (!Number.isSafeInteger(total)) throw invalid(text);
  return total;
}

function invalid(text: string): RangeError {
  return new RangeError(`Invalid duration: ${JSON.stringify(text)}`);
}
