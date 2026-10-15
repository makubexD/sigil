/**
 * Splits an amount in cents into `parts` shares, one per payer.
 *
 * @param totalCents - Amount to split, in whole cents.
 * @param parts - Number of payers; a positive integer.
 * @returns Shares that sum to `totalCents`, differ by at most 1 cent, larger shares first.
 * @throws {RangeError} If `totalCents` is not a safe integer or `parts` is not a positive safe integer.
 */
export function splitCents(totalCents: number, parts: number): number[] {
  if (!Number.isSafeInteger(totalCents)) {
    throw new RangeError(`totalCents must be a whole number of cents, got ${totalCents}`);
  }
  if (!Number.isSafeInteger(parts) || parts < 1) {
    throw new RangeError(`parts must be a positive integer, got ${parts}`);
  }
  const baseShare = Math.floor(totalCents / parts);
  // The leftover cents (0 <= remainder < parts) go one each to the first payers.
  const remainder = totalCents - baseShare * parts;
  return Array.from({ length: parts }, (_, i) => (i < remainder ? baseShare + 1 : baseShare));
}

/** Formats cents as dollars, e.g. 1234 -> "$12.34". */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
