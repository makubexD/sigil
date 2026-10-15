/**
 * Order summarization over a paginated source — streams pages, retries failed fetches with
 * exponential backoff, and aggregates net cents per customer without buffering every order.
 *
 * @module
 */

/** Lifecycle state of an order. Only `paid` and `refunded` affect totals. */
export type OrderStatus = 'paid' | 'refunded' | 'pending';

/** A single order as returned by the order source. */
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

/** Fetches a 1-based page of orders. */
export type FetchPage = (page: number) => Promise<OrderPage>;

/** Retry tuning for {@link summarizeOrders}. */
export interface SummarizeOptions {
  /** Extra attempts after the first failure for each page. Default 3. */
  readonly retries?: number;
  /** Delay before the first retry; doubles on each subsequent retry. Default 100. */
  readonly baseDelayMs?: number;
}

/** Net cents for one customer. */
export interface CustomerTotal {
  readonly customerId: string;
  readonly totalCents: number;
}

/** Result of {@link summarizeOrders}. */
export interface OrderSummary {
  /** Sorted by `totalCents` descending, then `customerId` ascending (code-unit order). */
  readonly totals: CustomerTotal[];
  readonly skippedPending: number;
}

const FIRST_PAGE = 1;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;

interface Accumulator {
  readonly totalsByCustomer: Map<string, number>;
  skippedPending: number;
}

/**
 * Walks every page from page 1 and summarizes net cents (paid minus refunded) per customer.
 *
 * Pages are fetched one at a time because each page names the next. Memory is bounded by the
 * number of distinct customers plus one page, so ~1M orders across many pages is fine.
 *
 * @param fetchPage - Source of order pages; the first page requested is 1.
 * @param opts - Retry count and base backoff delay; defaults 3 and 100 ms.
 * @returns Per-customer totals (customers with only pending orders are omitted) and the count
 *   of pending orders.
 * @throws {RangeError} If `retries` or `baseDelayMs` is not a non-negative integer/finite number,
 *   or an order has a non-integer `amountCents`.
 * @throws {TypeError} If an order has an unknown `status`.
 * @throws {Error} If a page still fails after all retries; `cause` is the last failure.
 */
export async function summarizeOrders(
  fetchPage: FetchPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  validateOptions(retries, baseDelayMs);

  const acc: Accumulator = { totalsByCustomer: new Map(), skippedPending: 0 };
  let page: number | null = FIRST_PAGE;
  while (page !== null) {
    // Sequential by necessity: the next page number comes from this response.
    const result: OrderPage = await fetchWithRetry(fetchPage, page, retries, baseDelayMs);
    for (const order of result.items) applyOrder(acc, order);
    page = result.nextPage;
  }
  return { totals: toSortedTotals(acc.totalsByCustomer), skippedPending: acc.skippedPending };
}

function validateOptions(retries: number, baseDelayMs: number): void {
  if (!Number.isInteger(retries) || retries < 0) {
    throw new RangeError(`retries must be a non-negative integer, got ${retries}`);
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError(`baseDelayMs must be a non-negative finite number, got ${baseDelayMs}`);
  }
}

async function fetchWithRetry(
  fetchPage: FetchPage,
  page: number,
  retries: number,
  baseDelayMs: number,
): Promise<OrderPage> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(baseDelayMs * 2 ** (attempt - 1));
    try {
      return await fetchPage(page);
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`Failed to fetch page ${page} after ${retries + 1} attempts`, {
    cause: lastError,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function applyOrder(acc: Accumulator, order: Order): void {
  switch (order.status) {
    case 'pending':
      acc.skippedPending++;
      return;
    case 'paid':
      addCents(acc.totalsByCustomer, order, order.amountCents);
      return;
    case 'refunded':
      addCents(acc.totalsByCustomer, order, -order.amountCents);
      return;
    default: {
      const unknownStatus: never = order.status;
      throw new TypeError(`Order ${order.id} has unknown status: ${String(unknownStatus)}`);
    }
  }
}

function addCents(totals: Map<string, number>, order: Order, deltaCents: number): void {
  if (!Number.isInteger(order.amountCents)) {
    throw new RangeError(`Order ${order.id} has non-integer amountCents: ${order.amountCents}`);
  }
  totals.set(order.customerId, (totals.get(order.customerId) ?? 0) + deltaCents);
}

function toSortedTotals(totalsByCustomer: Map<string, number>): CustomerTotal[] {
  const totals = Array.from(totalsByCustomer, ([customerId, totalCents]) => ({
    customerId,
    totalCents,
  }));
  // Code-unit comparison rather than localeCompare: deterministic across locales and faster.
  return totals.sort(
    (a, b) =>
      b.totalCents - a.totalCents ||
      (a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0),
  );
}
