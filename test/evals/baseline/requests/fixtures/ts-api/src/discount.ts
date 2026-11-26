/** Rounds a price to the cent. */
export function roundPrice(price: number): number {
  return Math.round(price * 100) / 100;
}
