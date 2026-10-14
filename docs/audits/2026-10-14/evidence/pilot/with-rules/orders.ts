/**
 * Order summarizer — streams paginated orders, retries failing page fetches with
 * exponential backoff, and aggregates net paid-minus-refunded cents per customer.
 *
 * @module
 */

/** A single order as returned by the order source. */
export interface Order {
  readonly id: string;
  readonly customerId: string;
  readonly amountCents: number;
  readonly status: OrderStatus;
}

/** The closed set of order statuses. */
export type OrderStatus = "paid" | "refunded" | "pending";

/** One page of orders; `nextPage` is `null` on the last page. */
export interface OrderPage {
  readonly items: readonly Order[];
  readonly nextPage: number | null;
}

/** Fetches one page of orders by page number. */
export type FetchOrders = (page: number) => Promise<OrderPage>;

/** Minimal injected logger for retry diagnostics. */
export interface Logger {
  warn(fields: Record<string, unknown>, message: string): void;
}

/** Tuning and dependencies for {@link summarizeOrders}; every field is optional. */
export interface SummarizeOptions {
  /** First page number to request. Defaults to {@link DEFAULT_FIRST_PAGE}. */
  readonly firstPage?: number;
  /** Retries after the first failed attempt of a page. Defaults to {@link DEFAULT_MAX_RETRIES}. */
  readonly maxRetries?: number;
  /** Base backoff delay in ms; doubles each retry. Defaults to {@link DEFAULT_BASE_DELAY_MS}. */
  readonly baseDelayMs?: number;
  /** Cancels fetching between pages and during backoff. */
  readonly signal?: AbortSignal;
  /** Receives a warning per failed attempt. */
  readonly logger?: Logger;
  /** Injectable delay, for tests. Defaults to a timer that honors `signal`. */
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/** Net total for one customer. */
export interface CustomerTotal {
  readonly customerId: string;
  readonly totalCents: number;
}

/** Result of {@link summarizeOrders}. */
export interface OrdersSummary {
  /** Per-customer net cents (paid minus refunded), sorted by total descending, then customerId ascending. */
  readonly totals: readonly CustomerTotal[];
  /** Number of pending orders excluded from the totals. */
  readonly skippedPending: number;
}

/** Thrown when a page still fails after all retries; the last failure is attached as `cause`. */
export class OrderFetchError extends Error {
  constructor(
    readonly page: number,
    readonly attempts: number,
    options: { cause: unknown },
  ) {
    super(`Failed to fetch orders page ${page} after ${attempts} attempts`, options);
    this.name = "OrderFetchError";
  }
}

export const DEFAULT_FIRST_PAGE = 1;
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_BASE_DELAY_MS = 100;

interface RetryPolicy {
  readonly maxRetries: number;
  readonly baseDelayMs: number;
  readonly signal: AbortSignal | undefined;
  readonly logger: Logger | undefined;
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
}

interface Tally {
  readonly netByCustomer: Map<string, number>;
  skippedPending: number;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function toPolicy(opts: SummarizeOptions): RetryPolicy {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw new RangeError(`maxRetries must be a non-negative integer, got ${maxRetries}`);
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError(`baseDelayMs must be a non-negative number, got ${baseDelayMs}`);
  }
  return { maxRetries, baseDelayMs, signal: opts.signal, logger: opts.logger, sleep: opts.sleep ?? defaultSleep };
}

async function fetchPageWithRetry(fetchOrders: FetchOrders, page: number, policy: RetryPolicy): Promise<OrderPage> {
  const attempts = policy.maxRetries + 1;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    policy.signal?.throwIfAborted();
    try {
      return await fetchOrders(page);
    } catch (err) {
      lastError = err;
      policy.logger?.warn({ err, page, attempt }, "Order page fetch failed");
      // Retries for one page are inherently sequential: each waits on the previous failure.
      if (attempt < attempts) await policy.sleep(policy.baseDelayMs * 2 ** (attempt - 1), policy.signal);
    }
  }
  throw new OrderFetchError(page, attempts, { cause: lastError });
}

function applyOrder(tally: Tally, order: Order): void {
  switch (order.status) {
    case "pending":
      tally.skippedPending++;
      return;
    case "paid":
    case "refunded": {
      const sign = order.status === "paid" ? 1 : -1;
      const current = tally.netByCustomer.get(order.customerId) ?? 0;
      tally.netByCustomer.set(order.customerId, current + sign * order.amountCents);
      return;
    }
    default: {
      const exhaustive: never = order.status;
      throw new TypeError(`Unhandled order status: ${String(exhaustive)}`);
    }
  }
}

function toSortedTotals(netByCustomer: ReadonlyMap<string, number>): CustomerTotal[] {
  const totals = Array.from(netByCustomer, ([customerId, totalCents]) => ({ customerId, totalCents }));
  return totals.sort(
    (a, b) => b.totalCents - a.totalCents || (a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0),
  );
}

/**
 * Fetches every page of orders and summarizes net cents per customer.
 *
 * Pages are fetched sequentially because each page names the next. Orders are folded into a
 * `Map` as each page arrives, so memory grows with distinct customers, not total orders.
 *
 * @param fetchOrders - Page fetcher; called with `firstPage`, then each returned `nextPage`.
 * @param opts - Retry, cancellation and logging options.
 * @returns Totals sorted by net cents descending (ties by customerId), plus the pending count.
 * @throws {OrderFetchError} When a page fails `maxRetries + 1` times.
 * @throws {RangeError} When an option is out of range.
 */
export async function summarizeOrders(fetchOrders: FetchOrders, opts: SummarizeOptions = {}): Promise<OrdersSummary> {
  const policy = toPolicy(opts);
  const tally: Tally = { netByCustomer: new Map(), skippedPending: 0 };
  let page: number | null = opts.firstPage ?? DEFAULT_FIRST_PAGE;
  while (page !== null) {
    const result = await fetchPageWithRetry(fetchOrders, page, policy);
    for (const order of result.items) applyOrder(tally, order);
    page = result.nextPage;
  }
  return { totals: toSortedTotals(tally.netByCustomer), skippedPending: tally.skippedPending };
}
