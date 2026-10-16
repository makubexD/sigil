/**
 * Order summarization — streams paginated orders and reduces them to per-customer net totals
 * without holding the full order set in memory.
 *
 * @module
 */

import { withRetry } from './retry.ts';

/** Lifecycle state of an order; only `paid` and `refunded` affect totals. */
export type OrderStatus = 'paid' | 'refunded' | 'pending';

/** A single order as returned by the order service. */
export interface Order {
  readonly id: string;
  readonly customerId: string;
  /** Non-negative integer amount in cents. */
  readonly amountCents: number;
  readonly status: OrderStatus;
}

/** One page of orders; `nextPage` is `null` on the last page. */
export interface OrderPage {
  readonly items: readonly Order[];
  readonly nextPage: number | null;
}

/** Fetches a page of orders by 1-based page number. */
export type FetchOrderPage = (page: number) => Promise<OrderPage>;

/** Tuning for {@link summarizeOrders}. */
export interface SummarizeOrdersOptions {
  /** Retries per failing page fetch after the first attempt. Defaults to 3. */
  readonly retries?: number;
  /** Delay before the first retry of a page; doubles on each later retry. Defaults to 100. */
  readonly baseDelayMs?: number;
}

/** Net cents for one customer. */
export interface CustomerTotal {
  readonly customerId: string;
  readonly totalCents: number;
}

/** Result of {@link summarizeOrders}. */
export interface OrderSummary {
  /** Sorted by `totalCents` descending, then `customerId` ascending. */
  readonly totals: CustomerTotal[];
  readonly skippedPending: number;
}

const FIRST_PAGE = 1;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;

/**
 * Fetches every page of orders and sums paid minus refunded cents per customer.
 *
 * Pending orders are counted in `skippedPending` and contribute nothing to totals, so a customer
 * whose orders are all pending does not appear in `totals`.
 *
 * @param fetchPage - Fetches one page; pages are requested sequentially starting at 1.
 * @param opts - Retry tuning; see {@link SummarizeOrdersOptions}.
 * @returns Per-customer net totals and the pending-order count.
 * @throws {RangeError} If `opts` holds an invalid retry count or delay, or if pagination
 *   revisits a page (which would otherwise loop forever).
 * @throws {TypeError} If an order has an unknown status or a non-integer / negative amount.
 * @throws {Error} If a page still fails after all retries; `cause` is the last failure.
 */
export async function summarizeOrders(
  fetchPage: FetchOrderPage,
  opts: SummarizeOrdersOptions = {},
): Promise<OrderSummary> {
  const retryOptions = {
    retries: opts.retries ?? DEFAULT_RETRIES,
    baseDelayMs: opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
  };
  const totalsByCustomer = new Map<string, number>();
  let skippedPending = 0;

  for await (const page of iteratePages((page) =>
    withRetry(() => fetchPage(page), `Fetching order page ${page}`, retryOptions),
  )) {
    for (const order of page) {
      const contribution = signedAmountCents(order);
      if (contribution === undefined) {
        skippedPending++;
        continue;
      }
      const current = totalsByCustomer.get(order.customerId) ?? 0;
      totalsByCustomer.set(order.customerId, current + contribution);
    }
  }

  return { totals: sortTotals(totalsByCustomer), skippedPending };
}

/** Yields each page's items in order, following `nextPage` until it is `null`. */
async function* iteratePages(fetchPage: FetchOrderPage): AsyncGenerator<readonly Order[]> {
  const visited = new Set<number>();
  let page: number | null = FIRST_PAGE;
  while (page !== null) {
    if (visited.has(page)) {
      throw new RangeError(`Pagination revisited page ${page}`);
    }
    visited.add(page);
    // Pages are inherently sequential: each response names the next page to fetch.
    const { items, nextPage } = await fetchPage(page);
    yield items;
    page = nextPage;
  }
}

/** Returns the order's contribution to its customer's total, or `undefined` for pending orders. */
function signedAmountCents(order: Order): number | undefined {
  if (!Number.isSafeInteger(order.amountCents) || order.amountCents < 0) {
    throw new TypeError(`Order ${order.id} has invalid amountCents: ${order.amountCents}`);
  }
  switch (order.status) {
    case 'paid':
      return order.amountCents;
    case 'refunded':
      return -order.amountCents;
    case 'pending':
      return undefined;
    default: {
      const unhandled: never = order.status;
      throw new TypeError(`Order ${order.id} has unknown status: ${String(unhandled)}`);
    }
  }
}

function sortTotals(totalsByCustomer: ReadonlyMap<string, number>): CustomerTotal[] {
  const totals = Array.from(totalsByCustomer, ([customerId, totalCents]) => ({
    customerId,
    totalCents,
  }));
  // Code-unit comparison rather than localeCompare keeps ordering locale-independent.
  return totals.sort(
    (a, b) =>
      b.totalCents - a.totalCents ||
      (a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0),
  );
}
