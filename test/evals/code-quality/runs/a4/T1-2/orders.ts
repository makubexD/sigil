/**
 * Order summarization — streams paginated orders into per-customer net totals
 * without holding the full order list in memory.
 *
 * @module
 */

/** Lifecycle state of an order; only `paid` and `refunded` affect totals. */
export type OrderStatus = 'paid' | 'pending' | 'refunded';

/** A single order as returned by the order source. */
export interface Order {
  readonly id: string;
  readonly customerId: string;
  /** Non-negative integer amount in cents; the sign is derived from `status`. */
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
  readonly netByCustomer: Map<string, number>;
  skippedPending: number;
}

/**
 * Walks every page starting at page 1 and sums paid minus refunded cents per customer.
 *
 * Orders are aggregated page by page, so memory is bounded by the number of distinct
 * customers rather than the number of orders. Customers whose only orders are pending
 * do not appear in `totals`.
 *
 * @param fetchPage - Source of order pages; a rejected or throwing call is retried.
 * @param opts - Retry count and base backoff delay.
 * @returns Per-customer totals and the number of pending orders skipped.
 * @throws {Error} With `cause` set to the last failure when a page still fails after all retries.
 * @throws {RangeError} On invalid options, malformed amounts, or a revisited page number.
 * @throws {TypeError} On a malformed page or order.
 */
export async function summarizeOrders(
  fetchPage: FetchPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const policy = resolveRetryPolicy(opts);
  const acc: Accumulator = { netByCustomer: new Map(), skippedPending: 0 };
  const visitedPages = new Set<number>();
  let page: number | null = FIRST_PAGE;
  while (page !== null) {
    // A source that loops back would otherwise never terminate.
    if (visitedPages.has(page)) throw new RangeError(`Page ${page} was requested twice`);
    visitedPages.add(page);
    const result = await fetchWithRetry(fetchPage, page, policy);
    assertPage(result, page);
    addOrders(acc, result.items);
    page = result.nextPage;
  }
  return { totals: toSortedTotals(acc.netByCustomer), skippedPending: acc.skippedPending };
}

function resolveRetryPolicy(opts: SummarizeOptions): RetryPolicy {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  if (!Number.isSafeInteger(retries) || retries < 0) {
    throw new RangeError(`retries must be a non-negative integer, got ${retries}`);
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError(`baseDelayMs must be a non-negative number, got ${baseDelayMs}`);
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
    if (attempt > 0) await sleep(policy.baseDelayMs * BACKOFF_FACTOR ** (attempt - 1));
    try {
      return await fetchPage(page);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Failed to fetch page ${page} after ${policy.retries + 1} attempts`, {
    cause: lastError,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertPage(result: OrderPage, page: number): void {
  if (!Array.isArray(result?.items)) {
    throw new TypeError(`Page ${page} has no items array`);
  }
  const { nextPage } = result;
  if (nextPage !== null && !(Number.isSafeInteger(nextPage) && nextPage >= FIRST_PAGE)) {
    throw new TypeError(`Page ${page} has invalid nextPage: ${String(nextPage)}`);
  }
}

function addOrders(acc: Accumulator, orders: readonly Order[]): void {
  for (const order of orders) {
    const delta = signedAmount(order);
    if (delta === undefined) {
      acc.skippedPending++;
      continue;
    }
    const total = (acc.netByCustomer.get(order.customerId) ?? 0) + delta;
    if (!Number.isSafeInteger(total)) {
      throw new RangeError(`Total for customer ${order.customerId} exceeds safe integer range`);
    }
    acc.netByCustomer.set(order.customerId, total);
  }
}

/** Returns the order's effect on its customer's total, or `undefined` for pending orders. */
function signedAmount(order: Order): number | undefined {
  if (typeof order.customerId !== 'string') {
    throw new TypeError(`Order ${order.id} has no customerId`);
  }
  if (!Number.isSafeInteger(order.amountCents) || order.amountCents < 0) {
    throw new RangeError(`Order ${order.id} has invalid amountCents: ${order.amountCents}`);
  }
  switch (order.status) {
    case 'paid':
      return order.amountCents;
    case 'refunded':
      return -order.amountCents;
    case 'pending':
      return undefined;
    default: {
      const unknownStatus: never = order.status;
      throw new TypeError(`Order ${order.id} has unknown status: ${String(unknownStatus)}`);
    }
  }
}

function toSortedTotals(netByCustomer: ReadonlyMap<string, number>): CustomerTotal[] {
  const totals = Array.from(netByCustomer, ([customerId, totalCents]) => ({ customerId, totalCents }));
  // Code-unit comparison keeps the order deterministic regardless of locale.
  return totals.sort(
    (a, b) =>
      b.totalCents - a.totalCents ||
      (a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0),
  );
}
