const AMOUNT = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

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

/**
 * Totals decimal money amounts exactly and returns the total with two decimal places.
 * Arithmetic is done in integer cents (bigint), so there is no floating-point rounding
 * and no upper bound on magnitude.
 */
export function sumAmounts(amounts: readonly string[]): string {
  let total = 0n;
  for (const amount of amounts) {
    total += toCents(amount);
  }
  const negative = total < 0n;
  const abs = negative ? -total : total;
  const whole = abs / 100n;
  const cents = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${cents}`;
}
