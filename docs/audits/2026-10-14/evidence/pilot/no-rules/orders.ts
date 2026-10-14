export type OrderStatus = 'paid' | 'refunded' | 'pending';

export interface Order {
  id: string;
  customerId: string;
  amountCents: number;
  status: OrderStatus;
}

export interface OrdersPage {
  items: Order[];
  nextPage: number | null;
}

export type FetchOrders = (page: number) => Promise<OrdersPage>;

export interface SummarizeOptions {
  /** First page number to request. Default 0. */
  startPage?: number;
  /** Retries after the first failed attempt. Default 3. */
  maxRetries?: number;
  /** Base backoff delay in ms; doubles per retry. Default 100. */
  baseDelayMs?: number;
  /** Injectable sleep, for tests. */
  sleep?: (ms: number) => Promise<void>;
}

export interface CustomerTotal {
  customerId: string;
  totalCents: number;
}

export interface OrdersSummary {
  totals: CustomerTotal[];
  skippedPending: number;
}

export class OrderFetchError extends Error {
  constructor(
    readonly page: number,
    readonly attempts: number,
    options: { cause: unknown },
  ) {
    super(`Failed to fetch orders page ${page} after ${attempts} attempts`, options);
    this.name = 'OrderFetchError';
  }
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(
  fetchOrders: FetchOrders,
  page: number,
  maxRetries: number,
  baseDelayMs: number,
  sleep: (ms: number) => Promise<void>,
): Promise<OrdersPage> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchOrders(page);
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw new OrderFetchError(page, maxRetries + 1, { cause: lastError });
}

/**
 * Fetches every page and returns per-customer net cents (paid minus refunded),
 * sorted by total descending, plus the number of skipped pending orders.
 * Streams page by page: memory is O(customers), not O(orders).
 */
export async function summarizeOrders(
  fetchOrders: FetchOrders,
  opts: SummarizeOptions = {},
): Promise<OrdersSummary> {
  const { startPage = 0, maxRetries = 3, baseDelayMs = 100, sleep = defaultSleep } = opts;
  const totals = new Map<string, number>();
  let skippedPending = 0;
  const seenPages = new Set<number>();
  let page: number | null = startPage;

  while (page !== null) {
    if (seenPages.has(page)) throw new Error(`Pagination cycle detected at page ${page}`);
    seenPages.add(page);
    const result = await fetchWithRetry(fetchOrders, page, maxRetries, baseDelayMs, sleep);
    for (const order of result.items) {
      if (order.status === 'pending') {
        skippedPending++;
        continue;
      }
      const delta = order.status === 'paid' ? order.amountCents : -order.amountCents;
      totals.set(order.customerId, (totals.get(order.customerId) ?? 0) + delta);
    }
    page = result.nextPage;
  }

  const sorted: CustomerTotal[] = Array.from(totals, ([customerId, totalCents]) => ({
    customerId,
    totalCents,
  }));
  sorted.sort((a, b) => b.totalCents - a.totalCents || (a.customerId < b.customerId ? -1 : 1));
  return { totals: sorted, skippedPending };
}
