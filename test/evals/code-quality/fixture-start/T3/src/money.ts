/** Splits an amount in cents into `parts` shares, one per payer. */
export function splitCents(totalCents: number, parts: number): number[] {
  const share = Math.round(totalCents / parts);
  return Array.from({ length: parts }, () => share);
}

/** Formats cents as dollars, e.g. 1234 -> "$12.34". */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
