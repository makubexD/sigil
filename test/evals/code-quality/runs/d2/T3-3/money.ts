/**
 * Splits an amount in cents into `parts` shares, one per payer.
 *
 * @param totalCents - Amount to split, in whole cents.
 * @param parts - Number of payers; a positive integer.
 * @returns Shares that sum exactly to `totalCents`, differ by at most 1 cent,
 *   and are ordered largest first.
 * @throws {RangeError} If `totalCents` is not an integer or `parts` is not a positive integer.
 */
export function splitCents(totalCents: number, parts: number): number[] {
  if (!Number.isSafeInteger(totalCents)) {
    throw new RangeError(`totalCents must be an integer, got ${totalCents}`);
  }
  if (!Number.isSafeInteger(parts) || parts < 1) {
    throw new RangeError(`parts must be a positive integer, got ${parts}`);
  }
  const baseShare = Math.floor(totalCents / parts);
  // Always in [0, parts), even for negative totals, because baseShare is floored.
  const leftoverCents = totalCents - baseShare * parts;
  return Array.from({ length: parts }, (_, i) => (i < leftoverCents ? baseShare + 1 : baseShare));
}

/** Formats cents as dollars, e.g. 1234 -> "$12.34". */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
