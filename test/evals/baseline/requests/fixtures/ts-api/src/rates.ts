/** Exchange rates as the rates service returns them, keyed by currency code. */
export type Rates = Record<string, number>;

/** Converts an amount with a rates table; throws on a currency the table lacks. */
export function convertAmount(amount: number, currency: string, rates: Rates): number {
  const rate = rates[currency];
  if (rate === undefined) throw new RangeError(`no rate for ${currency}`);
  return Math.round(amount * rate * 100) / 100;
}
