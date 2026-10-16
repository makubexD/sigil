/**
 * Splits an amount in cents into `parts` shares, one per payer.
 *
 * @param totalCents - Amount to split; must be an integer number of cents.
 * @param parts - Number of shares; must be a positive integer.
 * @returns Shares that sum to `totalCents`, differ by at most 1 cent, larger shares first.
 * @throws {RangeError} If `totalCents` is not an integer or `parts` is not a positive integer.
 */
export function splitCents(totalCents: number, parts: number): number[] {
  if (!Number.isInteger(totalCents)) {
    throw new RangeError(`totalCents must be an integer, got ${totalCents}`);
  }
  if (!Number.isInteger(parts) || parts < 1) {
    throw new RangeError(`parts must be a positive integer, got ${parts}`);
  }
  // Floor (not truncation) keeps the remainder in [0, parts) for negative totals too.
  const baseShare = Math.floor(totalCents / parts);
  const remainder = totalCents - baseShare * parts;
  return Array.from({ length: parts }, (_, i) => (i < remainder ? baseShare + 1 : baseShare));
}

/** Formats cents as dollars, e.g. 1234 -> "$12.34". */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
