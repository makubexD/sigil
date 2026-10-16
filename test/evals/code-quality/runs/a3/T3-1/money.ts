/**
 * Splits an amount in cents into `parts` shares, one per payer.
 * Shares sum to `totalCents`, differ by at most 1 cent, and the larger shares come first.
 */
export function splitCents(totalCents: number, parts: number): number[] {
  if (!Number.isSafeInteger(totalCents)) {
    throw new RangeError(`totalCents must be a safe integer, got ${totalCents}`);
  }
  if (!Number.isSafeInteger(parts) || parts < 1) {
    throw new RangeError(`parts must be a positive integer, got ${parts}`);
  }
  // Floor (not truncation) keeps the remainder non-negative, so negative totals work too.
  const baseShare = Math.floor(totalCents / parts);
  const remainder = totalCents - baseShare * parts;
  return Array.from({ length: parts }, (_, i) => (i < remainder ? baseShare + 1 : baseShare));
}

/** Formats cents as dollars, e.g. 1234 -> "$12.34". */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
