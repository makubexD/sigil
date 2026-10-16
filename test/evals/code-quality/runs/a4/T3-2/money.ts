/**
 * Splits an amount in cents into `parts` shares, one per payer.
 *
 * @param totalCents - Amount to split; must be an integer.
 * @param parts - Number of shares; must be a positive integer.
 * @returns Shares that sum to `totalCents`, differ by at most 1 cent, largest first.
 * @throws {RangeError} If `totalCents` is not an integer or `parts` is not a positive integer.
 */
export function splitCents(totalCents: number, parts: number): number[] {
  if (!Number.isInteger(totalCents)) {
    throw new RangeError(`totalCents must be an integer, got ${totalCents}`);
  }
  if (!Number.isInteger(parts) || parts < 1) {
    throw new RangeError(`parts must be a positive integer, got ${parts}`);
  }
  const baseShare = Math.floor(totalCents / parts);
  // The leftover cents (always < parts) go one each to the first payers.
  const leftoverCents = totalCents - baseShare * parts;
  return Array.from({ length: parts }, (_, index) =>
    index < leftoverCents ? baseShare + 1 : baseShare,
  );
}

/** Formats cents as dollars, e.g. 1234 -> "$12.34". */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
