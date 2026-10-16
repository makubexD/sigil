/**
 * Splits an amount in cents into `parts` shares, one per payer.
 *
 * @returns Shares that sum to `totalCents`, differ by at most 1 cent, largest first.
 * @throws {RangeError} If `totalCents` is not an integer or `parts` is not a positive integer.
 */
export function splitCents(totalCents: number, parts: number): number[] {
  if (!Number.isInteger(totalCents)) throw new RangeError(`totalCents must be an integer, got ${totalCents}`);
  if (!Number.isInteger(parts) || parts < 1) throw new RangeError(`parts must be a positive integer, got ${parts}`);
  // Floor, then hand the leftover cents to the first payers so nothing is lost to rounding.
  const base = Math.floor(totalCents / parts);
  const remainder = totalCents - base * parts;
  return Array.from({ length: parts }, (_, i) => (i < remainder ? base + 1 : base));
}

/** Formats cents as dollars, e.g. 1234 -> "$12.34". */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
