const AMOUNT = /^(-?)([0-9]+)(?:\.([0-9]{1,2}))?$/;

/** Parses a decimal amount string into an exact count of cents. */
function toCents(amount: string): bigint {
  const match = typeof amount === 'string' ? AMOUNT.exec(amount) : null;
  if (match === null) {
    throw new RangeError(`Invalid amount: ${JSON.stringify(amount)}`);
  }
  const [, sign, whole, fraction = ''] = match;
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return sign === '-' ? -cents : cents;
}

/** Formats a count of cents as a decimal string with exactly two places. */
function fromCents(cents: bigint): string {
  const negative = cents < 0n;
  const digits = (negative ? -cents : cents).toString().padStart(3, '0');
  const sign = negative ? '-' : '';
  return `${sign}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

/**
 * Totals money amounts given as decimal strings, exact to the cent.
 *
 * Each amount is an optional leading `-`, one or more digits, then optionally
 * a `.` and one or two digits. Throws a `RangeError` on any other amount.
 */
export function sumAmounts(amounts: readonly string[]): string {
  let total = 0n;
  for (const amount of amounts) {
    total += toCents(amount);
  }
  return fromCents(total);
}
