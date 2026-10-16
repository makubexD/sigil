/**
 * Splits an amount in cents into `parts` shares, one per payer.
 *
 * The shares sum exactly to `totalCents` and differ by at most 1 cent; the
 * leftover cents go to the first shares, so larger shares come first.
 *
 * @throws {RangeError} if `totalCents` is not an integer or `parts` is not a positive integer.
 */
export function splitCents(totalCents: number, parts: number): number[] {
  if (!Number.isSafeInteger(totalCents)) {
    throw new RangeError(`totalCents must be an integer, got ${totalCents}`);
  }
  if (!Number.isSafeInteger(parts) || parts < 1) {
    throw new RangeError(`parts must be a positive integer, got ${parts}`);
  }
  // Floor (not round or truncate) keeps the remainder non-negative, including for negative totals.
  const baseShare = Math.floor(totalCents / parts);
  const leftoverCents = totalCents - baseShare * parts;
  return Array.from({ length: parts }, (_, i) => (i < leftoverCents ? baseShare + 1 : baseShare));
}

/** Formats cents as dollars, e.g. 1234 -> "$12.34". */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
