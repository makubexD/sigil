/**
 * Splits an amount in cents into `parts` shares, one per payer.
 *
 * @returns Shares that sum to `totalCents`, differ by at most 1 cent, larger shares first.
 */
export function splitCents(totalCents: number, parts: number): number[] {
  const base = Math.floor(totalCents / parts);
  // Leftover cents go one each to the first payers so the shares sum exactly to the total
  const remainder = totalCents - base * parts;
  return Array.from({ length: parts }, (_, i) => (i < remainder ? base + 1 : base));
}

/** Formats cents as dollars, e.g. 1234 -> "$12.34". */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
