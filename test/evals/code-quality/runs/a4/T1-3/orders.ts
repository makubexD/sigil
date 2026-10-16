/**
 * Order summarization — walks a paginated order source with retrying fetches and
 * aggregates net cents per customer without holding every order in memory.
 *
 * @module
 */

/** Lifecycle state of an order; only `paid` and `refunded` affect totals. */
export type OrderStatus = "paid" | "refunded" | "pending";

/** A single order as returned by the paginated source. */
export interface Order {
  readonly id: string;
  readonly customerId: string;
  readonly amountCents: number;
  readonly status: OrderStatus;
}

/** One page of orders; `nextPage` is `null` on the last page. */
export interface OrderPage {
  readonly items: readonly Order[];
  readonly nextPage: number | null;
}

/** Fetches a page of orders by 1-based page number. */
export type FetchPage = (page: number) => Promise<OrderPage>;

/** Retry tuning for page fetches. */
export interface SummarizeOptions {
  /** Retries after the first failed attempt of a page. Default 3. */
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

const FIRST_PAGE = 1;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;
const BACKOFF_FACTOR = 2;

interface RetryPolicy {
  readonly retries: number;
  readonly baseDelayMs: number;
}

interface Accumulator {
  readonly totalsByCustomer: Map<string, number>;
  skippedPending: number;
}

/**
 * Fetches every page starting at page 1 and summarizes net cents per customer.
 *
 * Pages are processed one at a time and only per-customer totals are retained, so
 * memory scales with the number of customers rather than the number of orders.
 * Customers whose only orders are pending do not appear in `totals`.
 *
 * @param fetchPage - Page source; called with 1, then each returned `nextPage`.
 * @param opts - Retry count (default 3) and base backoff delay in ms (default 100).
 * @returns Per-customer totals and the count of skipped pending orders.
 * @throws {RangeError} If `retries` or `baseDelayMs` is not a non-negative integer.
 * @throws {Error} If a page still fails after all retries; `cause` is the last failure.
 * @throws {TypeError} If an order has an unknown status.
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
    for (const order of result.items) addOrder(acc, order);
    page = result.nextPage;
  }
  return { totals: sortTotals(acc.totalsByCustomer), skippedPending: acc.skippedPending };
}

function resolveRetryPolicy(opts: SummarizeOptions): RetryPolicy {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  assertNonNegativeInteger("retries", retries);
  assertNonNegativeInteger("baseDelayMs", baseDelayMs);
  return { retries, baseDelayMs };
}

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
  }
}

async function fetchWithRetry(
  fetchPage: FetchPage,
  page: number,
  policy: RetryPolicy,
): Promise<OrderPage> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= policy.retries; attempt++) {
    if (attempt > 0) await sleep(policy.baseDelayMs * BACKOFF_FACTOR ** (attempt - 1));
    try {
      return await fetchPage(page);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Failed to fetch page ${page} after ${policy.retries} retries`, {
    cause: lastError,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addOrder(acc: Accumulator, order: Order): void {
  const { status } = order;
  switch (status) {
    case "pending":
      acc.skippedPending++;
      return;
    case "paid":
      addCents(acc.totalsByCustomer, order.customerId, order.amountCents);
      return;
    case "refunded":
      addCents(acc.totalsByCustomer, order.customerId, -order.amountCents);
      return;
    default: {
      const unknownStatus: never = status;
      throw new TypeError(`Order ${order.id} has unknown status: ${unknownStatus}`);
    }
  }
}

function addCents(totals: Map<string, number>, customerId: string, cents: number): void {
  totals.set(customerId, (totals.get(customerId) ?? 0) + cents);
}

function sortTotals(totalsByCustomer: Map<string, number>): CustomerTotal[] {
  const totals = Array.from(totalsByCustomer, ([customerId, totalCents]) => ({
    customerId,
    totalCents,
  }));
  // Code-unit comparison keeps ordering deterministic regardless of locale.
  return totals.sort(
    (a, b) =>
      b.totalCents - a.totalCents ||
      (a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0),
  );
}
