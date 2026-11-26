/** Price of one order line in dollars, after a percentage discount, rounded to the cent. */
export function lineTotal(unitPrice: number, quantity: number, discountPct = 0): number {
  if (quantity < 0) throw new RangeError('quantity must not be negative');
  if (discountPct < 0 || discountPct > 100) {
    throw new RangeError('discount must be between 0 and 100');
  }
  const gross = unitPrice * quantity;
  const net = gross * (1 - discountPct / 100);
  return Math.round(net * 100) / 100;
}

/** Sum of the line totals of an order. */
export function orderTotal(
  lines: { unitPrice: number; quantity: number; discountPct?: number }[],
): number {
  const cents = lines.reduce(
    (sum, line) =>
      sum + Math.round(lineTotal(line.unitPrice, line.quantity, line.discountPct) * 100),
    0,
  );
  return cents / 100;
}
