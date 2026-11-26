export interface Order {
  id: string;
  total: number;
}

export interface Gateway {
  /** Charges the order's card; rejects when the card is declined or the gateway is down. */
  charge(order: Order): Promise<{ receipt: string }>;
}

export function amountInCents(order: Order): number {
  return Math.round(order.total * 100);
}
