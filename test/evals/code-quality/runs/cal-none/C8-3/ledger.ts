const AMOUNT = /^(-?)([0-9]+)(?:\.([0-9]{1,2}))?$/;

/** Parses a decimal amount string into an exact count of cents. */
function toCents(amount: string): bigint {
  const match = typeof amount === 'string' ? AMOUNT.exec(amount) : null;
  if (match === null) {
    throw new RangeError(`Invalid amount: ${JSON.stringify(amount)}`);
  }
  const [, sign, whole, frac = ''] = match;
  const cents = BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'));
  return sign === '-' ? -cents : cents;
}

/**
 * Totals decimal money amounts exactly, returning the sum with two decimal places.
 * Arithmetic is done in integer cents (bigint), so no precision is lost at any magnitude.
 */
export function sumAmounts(amounts: readonly string[]): string {
  let total = 0n;
  for (const amount of amounts) {
    total += toCents(amount);
  }
  const negative = total < 0n;
  const abs = negative ? -total : total;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}
