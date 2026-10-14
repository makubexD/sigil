export type Order = { id: string; customerId: string; amountCents: number; status: 'paid' | 'refunded' | 'pending' };
type Page = { items: Order[]; nextPage: number | null };

export interface Logger {
  info(message: string): void;
}

export interface OrderAggregator {
  add(order: Order, customerName: string): void;
  result(): { customerName: string; totalCents: number }[];
}

class ArrayOrderAggregator implements OrderAggregator {
  private rows: { customerName: string; totalCents: number }[] = [];

  add(order: Order, customerName: string): void {
    const x2 = order.status === 'paid' ? order.amountCents : -order.amountCents;
    const row = this.rows.find(r => r.customerName === customerName);
    if (row) row.totalCents += x2;
    else this.rows.push({ customerName, totalCents: x2 });
  }

  result() {
    return [...this.rows].sort((a, b) => b.totalCents - a.totalCents);
  }
}

export function createAggregator(): OrderAggregator {
  return new ArrayOrderAggregator();
}

/** Net paid-minus-refunded cents per customer name, across every page. */
export async function summarizeOrders(
  fetchPage: (page: number) => Promise<Page>,
  lookupCustomerName: (customerId: string) => Promise<string>,
  opts: { logger?: Logger; aggregator?: OrderAggregator } = {},
) {
  const all: Order[] = [];
  for (let page: number | null = 1; page !== null; ) {
    try {
      const result = await fetchPage(page);
      all.push(...result.items);
      page = result.nextPage;
    } catch (err) {
      opts.logger?.info(`page ${page} failed: ${String(err)}`);
      page = null;
    }
  }
  const aggregator = opts.aggregator ?? createAggregator();
  for (const order of all) {
    if (order.status === 'pending') continue;
    aggregator.add(order, await lookupCustomerName(order.customerId));
  }
  return aggregator.result();
}
