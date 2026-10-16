/**
 * Order summarization — streams paginated orders into per-customer net totals,
 * retrying failed page fetches with exponential backoff.
 *
 * @module
 */

/** Lifecycle state of an order; only `paid` and `refunded` affect totals. */
export type OrderStatus = 'paid' | 'refunded' | 'pending';

/** A single order. `amountCents` is a non-negative integer; refunds are subtracted, not negative. */
export interface Order {
  readonly id: string;
  readonly customerId: string;
  readonly amountCents: number;
  readonly status: OrderStatus;
}

/** One page of orders. `nextPage` is `null` on the last page. */
export interface OrderPage {
  readonly items: readonly Order[];
  readonly nextPage: number | null;
}

/** Fetches a 1-based page of orders. */
export type FetchPage = (page: number) => Promise<OrderPage>;

/** Retry tuning for page fetches. */
export interface SummarizeOptions {
  /** Retries after the first failed attempt per page. Default 3. */
  readonly retries?: number;
  /** Delay before the first retry; doubles on each subsequent retry. Default 100. */
  readonly baseDelayMs?: number;
}

/** Net cents (paid minus refunded) for one customer. */
export interface CustomerTotal {
  readonly customerId: string;
  readonly totalCents: number;
}

/** Result of {@link summarizeOrders}. */
export interface OrderSummary {
  /** Sorted by `totalCents` descending, then `customerId` ascending. */
  readonly totals: CustomerTotal[];
  /** Number of pending orders, which are excluded from totals. */
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
const BACKOFF_FACTOR = 2;

/**
 * Fetches every order page, starting at page 1, and summarizes net cents per customer.
 *
 * Pages are folded into running totals as they arrive, so memory grows with the number of
 * distinct customers rather than the number of orders.
 *
 * @param fetchPage - Loads one page; rejected promises are retried.
 * @param opts - Retry count and base backoff delay.
 * @returns Per-customer totals and the count of skipped pending orders.
 * @throws {RangeError} If `opts` holds a negative or non-integer retry count or an invalid delay,
 *   or an order has an amount that is not a non-negative safe integer.
 * @throws {Error} If a page still fails after all retries; `cause` is the last failure.
 */
export async function summarizeOrders(
  fetchPage: FetchPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const policy = resolveRetryPolicy(opts);
  const acc: Accumulator = { totalsByCustomer: new Map(), skippedPending: 0 };
  let page: number | null = FIRST_PAGE;
  while (page !== null) {
    const result: OrderPage = await fetchWithRetry(fetchPage, page, policy);
    for (const order of result.items) accumulateOrder(acc, order);
    page = result.nextPage;
  }
  return { totals: sortTotals(acc.totalsByCustomer), skippedPending: acc.skippedPending };
}

function resolveRetryPolicy(opts: SummarizeOptions): RetryPolicy {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  if (!Number.isInteger(retries) || retries < 0) {
    throw new RangeError(`retries must be a non-negative integer, got ${retries}`);
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError(`baseDelayMs must be a non-negative finite number, got ${baseDelayMs}`);
  }
  return { retries, baseDelayMs };
}

async function fetchWithRetry(
  fetchPage: FetchPage,
  page: number,
  policy: RetryPolicy,
): Promise<OrderPage> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= policy.retries; attempt++) {
    if (attempt > 0) await delay(policy.baseDelayMs * BACKOFF_FACTOR ** (attempt - 1));
    try {
      return await fetchPage(page);
    } catch (error) {
      // Recovered by retrying; the last failure is surfaced as the cause below.
      lastError = error;
    }
  }
  const attempts = policy.retries + 1;
  throw new Error(`Failed to fetch order page ${page} after ${attempts} attempts`, {
    cause: lastError,
  });
}

// Resolves the global setTimeout per call (not a captured import) so fake timers can control backoff.
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function accumulateOrder(acc: Accumulator, order: Order): void {
  if (!Number.isSafeInteger(order.amountCents) || order.amountCents < 0) {
    throw new RangeError(`Order ${order.id} has invalid amountCents: ${order.amountCents}`);
  }
  switch (order.status) {
    case 'paid':
      addToCustomer(acc.totalsByCustomer, order.customerId, order.amountCents);
      return;
    case 'refunded':
      addToCustomer(acc.totalsByCustomer, order.customerId, -order.amountCents);
      return;
    case 'pending':
      acc.skippedPending += 1;
      return;
    default: {
      const unhandled: never = order.status;
      throw new Error(`Order ${order.id} has unknown status: ${String(unhandled)}`);
    }
  }
}

function addToCustomer(totals: Map<string, number>, customerId: string, cents: number): void {
  totals.set(customerId, (totals.get(customerId) ?? 0) + cents);
}

function sortTotals(totalsByCustomer: ReadonlyMap<string, number>): CustomerTotal[] {
  const totals = Array.from(totalsByCustomer, ([customerId, totalCents]) => ({
    customerId,
    totalCents,
  }));
  return totals.sort(compareTotals);
}

// Code-unit comparison rather than localeCompare keeps ordering stable across locales.
function compareTotals(a: CustomerTotal, b: CustomerTotal): number {
  if (a.totalCents !== b.totalCents) return b.totalCents - a.totalCents;
  if (a.customerId === b.customerId) return 0;
  return a.customerId < b.customerId ? -1 : 1;
}
