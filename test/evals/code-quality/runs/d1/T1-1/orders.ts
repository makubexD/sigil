/**
 * Order summaries — streams a paginated order source and totals net paid cents per customer.
 *
 * @module
 */
import { withRetry } from './retry.ts';

export const OrderStatus = { PAID: 'paid', REFUNDED: 'refunded', PENDING: 'pending' } as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export type Order = {
  readonly id: string;
  readonly customerId: string;
  /** Integer amount in cents. */
  readonly amountCents: number;
  readonly status: OrderStatus;
};

export type OrderPage = {
  readonly items: readonly Order[];
  /** The page to fetch next, or `null` when this is the last page. */
  readonly nextPage: number | null;
};

/** Fetches one page of orders; pages start at {@link FIRST_PAGE}. */
export type FetchOrderPage = (page: number) => Promise<OrderPage>;

export type SummarizeOptions = {
  /** Retries per page after the first failed attempt. Defaults to {@link DEFAULT_RETRIES}. */
  readonly retries?: number;
  /** Backoff before the first retry, doubling each retry. Defaults to {@link DEFAULT_BASE_DELAY_MS}. */
  readonly baseDelayMs?: number;
};

export type CustomerTotal = {
  readonly customerId: string;
  readonly totalCents: number;
};

export type OrderSummary = {
  /** Sorted by `totalCents` descending, then `customerId` ascending. */
  readonly totals: readonly CustomerTotal[];
  readonly skippedPending: number;
};

export const FIRST_PAGE = 1;
export const DEFAULT_RETRIES = 3;
export const DEFAULT_BASE_DELAY_MS = 100;

/**
 * Fetches every page and returns each customer's paid minus refunded cents.
 *
 * Pages are consumed one at a time and only per-customer running totals are kept, so memory
 * scales with the number of customers, not orders. Pending orders are counted and otherwise
 * ignored; a customer whose only orders are pending does not appear in `totals`.
 *
 * @throws {Error} When a page still fails after all retries; `cause` is the last failure.
 * @throws {Error} When the source revisits a page, which would otherwise loop forever.
 * @throws {RangeError} When `retries` or `baseDelayMs` is invalid.
 */
export async function summarizeOrders(
  fetchPage: FetchOrderPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const retryOptions = {
    retries: opts.retries ?? DEFAULT_RETRIES,
    baseDelayMs: opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
  };
  const totalsByCustomer = new Map<string, number>();
  let skippedPending = 0;

  const fetchPageWithRetry: FetchOrderPage = (page) =>
    withRetry(`Fetching order page ${page}`, () => fetchPage(page), retryOptions);

  for await (const order of iterateOrders(fetchPageWithRetry)) {
    const signedCents = netContribution(order);
    if (signedCents === undefined) {
      skippedPending++;
      continue;
    }
    totalsByCustomer.set(
      order.customerId,
      (totalsByCustomer.get(order.customerId) ?? 0) + signedCents,
    );
  }

  return { totals: sortTotals(totalsByCustomer), skippedPending };
}

async function* iterateOrders(fetchPage: FetchOrderPage): AsyncGenerator<Order> {
  const visitedPages = new Set<number>();
  let page: number | null = FIRST_PAGE;
  while (page !== null) {
    if (visitedPages.has(page)) {
      throw new Error(`Order source revisited page ${page}`);
    }
    visitedPages.add(page);
    const result: OrderPage = await fetchPage(page);
    yield* result.items;
    page = result.nextPage;
  }
}

/** Signed cents an order adds to its customer's total, or `undefined` for pending orders. */
function netContribution(order: Order): number | undefined {
  switch (order.status) {
    case OrderStatus.PAID:
      return order.amountCents;
    case OrderStatus.REFUNDED:
      return -order.amountCents;
    case OrderStatus.PENDING:
      return undefined;
    default: {
      const unknownStatus: never = order.status;
      throw new Error(`Order ${order.id} has unknown status ${String(unknownStatus)}`);
    }
  }
}

function sortTotals(totalsByCustomer: ReadonlyMap<string, number>): CustomerTotal[] {
  const totals = Array.from(totalsByCustomer, ([customerId, totalCents]) => ({
    customerId,
    totalCents,
  }));
  // Code-unit comparison rather than localeCompare: deterministic across locales and much
  // faster when sorting many customers.
  return totals.sort(
    (a, b) =>
      b.totalCents - a.totalCents ||
      (a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0),
  );
}
