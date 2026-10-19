const AMOUNT = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

export function sumAmounts(amounts: readonly string[]): string {
  let cents = 0n;
  for (const amount of amounts) {
    const match = AMOUNT.exec(amount);
    if (!match) throw new RangeError(`not a money amount: ${JSON.stringify(amount)}`);
    const [, sign, whole, fraction = ''] = match;
    const value = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    cents += sign ? -value : value;
  }
  const negative = cents < 0n;
  const magnitude = negative ? -cents : cents;
  return `${negative ? '-' : ''}${magnitude / 100n}.${String(magnitude % 100n).padStart(2, '0')}`;
}
