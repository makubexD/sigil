export type OrderStatus = 'paid' | 'refunded' | 'pending';

export type Order = {
  readonly id: string;
  readonly customerId: string;
  readonly amountCents: number;
  readonly status: OrderStatus;
};

export interface OrderPage {
  readonly items: ReadonlyArray<Order>;
  readonly nextPage: number | null;
}

export type FetchPage = (page: number) => Promise<OrderPage>;

export interface SummarizeOptions {
  readonly retries?: number;
  readonly baseDelayMs?: number;
}

export interface CustomerTotal {
  readonly customerId: string;
  readonly totalCents: number;
}

export interface OrderSummary {
  readonly totals: CustomerTotal[];
  readonly skippedPending: number;
}

const FIRST_PAGE = 1;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;

/**
 * Streams every page from `fetchPage` and aggregates net cents (paid minus refunded) per customer.
 * Only per-customer totals are kept in memory, so the order count is bounded by page size, not by
 * the full result set. Pages are fetched sequentially because each page names the next one.
 *
 * @throws Error with `cause` set to the last failure once a page exhausts its retries.
 */
export async function summarizeOrders(
  fetchPage: FetchPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const retryPolicy = resolveRetryPolicy(opts);
  const netCentsByCustomer = new Map<string, number>();
  let skippedPending = 0;
  let page: number | null = FIRST_PAGE;

  while (page !== null) {
    const result: OrderPage = await fetchPageWithRetry(fetchPage, page, retryPolicy);
    for (const order of result.items) {
      if (order.status === 'pending') skippedPending++;
      else addToTotal(netCentsByCustomer, order);
    }
    page = result.nextPage;
  }

  return { totals: toSortedTotals(netCentsByCustomer), skippedPending };
}

interface RetryPolicy {
  readonly retries: number;
  readonly baseDelayMs: number;
}

function resolveRetryPolicy(opts: SummarizeOptions): RetryPolicy {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  if (!Number.isInteger(retries) || retries < 0) {
    throw new RangeError(`retries must be a non-negative integer, got ${retries}`);
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError(`baseDelayMs must be a non-negative number, got ${baseDelayMs}`);
  }
  return { retries, baseDelayMs };
}

async function fetchPageWithRetry(
  fetchPage: FetchPage,
  page: number,
  policy: RetryPolicy,
): Promise<OrderPage> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= policy.retries; attempt++) {
    if (attempt > 0) await sleep(policy.baseDelayMs * 2 ** (attempt - 1));
    try {
      return await fetchPage(page);
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`Failed to fetch page ${page} after ${policy.retries + 1} attempts`, {
    cause: lastError,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addToTotal(netCentsByCustomer: Map<string, number>, order: Order): void {
  const current = netCentsByCustomer.get(order.customerId) ?? 0;
  netCentsByCustomer.set(order.customerId, current + signedCents(order));
}

function signedCents(order: Order): number {
  switch (order.status) {
    case 'paid':
      return order.amountCents;
    case 'refunded':
      return -order.amountCents;
    case 'pending':
      return 0;
    default: {
      const unhandled: never = order.status;
      throw new Error(`Unhandled order status: ${String(unhandled)} (order ${order.id})`);
    }
  }
}

function toSortedTotals(netCentsByCustomer: Map<string, number>): CustomerTotal[] {
  const totals = Array.from(netCentsByCustomer, ([customerId, totalCents]) => ({
    customerId,
    totalCents,
  }));
  return totals.sort(
    (a, b) =>
      b.totalCents - a.totalCents ||
      (a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0),
  );
}
