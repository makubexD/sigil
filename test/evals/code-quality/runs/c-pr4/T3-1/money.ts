/**
 * Splits an amount in cents into `parts` shares, one per payer.
 *
 * @param totalCents - Amount to split, in whole cents.
 * @param parts - Number of shares; a positive integer.
 * @returns Shares that sum to `totalCents`, differ by at most 1 cent, larger shares first.
 * @throws {RangeError} If `totalCents` is not an integer or `parts` is not a positive integer.
 */
export function splitCents(totalCents: number, parts: number): number[] {
  if (!Number.isSafeInteger(totalCents)) {
    throw new RangeError(`totalCents must be an integer, got ${totalCents}`);
  }
  if (!Number.isSafeInteger(parts) || parts < 1) {
    throw new RangeError(`parts must be a positive integer, got ${parts}`);
  }
  // Floor (not round or truncate) keeps the remainder in [0, parts) even for negative totals,
  // so handing out one extra cent to the first `remainder` shares always puts larger shares first.
  const baseShare = Math.floor(totalCents / parts);
  const remainder = totalCents - baseShare * parts;
  return Array.from({ length: parts }, (_, index) => (index < remainder ? baseShare + 1 : baseShare));
}

/** Formats cents as dollars, e.g. 1234 -> "$12.34". */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
