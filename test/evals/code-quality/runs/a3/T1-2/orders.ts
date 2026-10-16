export type OrderStatus = 'paid' | 'refunded' | 'pending';

export interface Order {
  readonly id: string;
  readonly customerId: string;
  readonly amountCents: number;
  readonly status: OrderStatus;
}

export interface OrderPage {
  readonly items: readonly Order[];
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

interface RetryPolicy {
  readonly retries: number;
  readonly baseDelayMs: number;
}

interface Accumulator {
  readonly totalsByCustomer: Map<string, number>;
  skippedPending: number;
}

const FIRST_PAGE = 1;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches one page, retrying up to `policy.retries` times with exponential backoff
 * (`baseDelayMs * 2 ** attempt`). Throws an Error whose `cause` is the last failure.
 */
async function fetchWithRetry(fetchPage: FetchPage, page: number, policy: RetryPolicy): Promise<OrderPage> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchPage(page);
    } catch (err) {
      if (attempt >= policy.retries) {
        throw new Error(`Failed to fetch page ${page} after ${attempt + 1} attempts`, { cause: err });
      }
      await sleep(policy.baseDelayMs * 2 ** attempt);
    }
  }
}

function addOrders(acc: Accumulator, orders: readonly Order[]): void {
  for (const order of orders) {
    if (order.status === 'pending') {
      acc.skippedPending++;
      continue;
    }
    const signed = order.status === 'refunded' ? -order.amountCents : order.amountCents;
    acc.totalsByCustomer.set(order.customerId, (acc.totalsByCustomer.get(order.customerId) ?? 0) + signed);
  }
}

function compareTotals(a: CustomerTotal, b: CustomerTotal): number {
  if (a.totalCents !== b.totalCents) return b.totalCents - a.totalCents;
  if (a.customerId === b.customerId) return 0;
  return a.customerId < b.customerId ? -1 : 1;
}

/**
 * Walks every page from page 1 and returns per-customer net cents (paid minus refunded),
 * sorted by `totalCents` descending then `customerId` ascending, plus the count of pending
 * orders. Pages are folded into running totals as they arrive, so memory grows with the
 * number of customers, not the number of orders.
 */
export async function summarizeOrders(fetchPage: FetchPage, opts: SummarizeOptions = {}): Promise<OrderSummary> {
  const policy: RetryPolicy = {
    retries: opts.retries ?? DEFAULT_RETRIES,
    baseDelayMs: opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
  };
  const acc: Accumulator = { totalsByCustomer: new Map(), skippedPending: 0 };
  let page: number | null = FIRST_PAGE;
  while (page !== null) {
    const result = await fetchWithRetry(fetchPage, page, policy);
    addOrders(acc, result.items);
    page = result.nextPage;
  }
  const totals = Array.from(acc.totalsByCustomer, ([customerId, totalCents]) => ({ customerId, totalCents }));
  return { totals: totals.sort(compareTotals), skippedPending: acc.skippedPending };
}
