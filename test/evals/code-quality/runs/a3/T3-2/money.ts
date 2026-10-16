/**
 * Splits an amount in cents into `parts` shares, one per payer.
 *
 * Shares add up to `totalCents` and differ by at most 1 cent; the leftover cents go to the first
 * payers, so larger shares come first.
 */
export function splitCents(totalCents: number, parts: number): number[] {
  if (!Number.isInteger(totalCents)) {
    throw new RangeError(`totalCents must be an integer, got ${totalCents}`);
  }
  if (!Number.isInteger(parts) || parts < 1) {
    throw new RangeError(`parts must be a positive integer, got ${parts}`);
  }
  // Floor (not round or truncate) keeps the remainder non-negative, also for negative totals.
  const baseShare = Math.floor(totalCents / parts);
  const leftoverCents = totalCents - baseShare * parts;
  return Array.from({ length: parts }, (_, index) =>
    index < leftoverCents ? baseShare + 1 : baseShare,
  );
}

/** Formats cents as dollars, e.g. 1234 -> "$12.34". */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
