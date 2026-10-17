/**
 * Order summarization — walks a paginated order source with retrying fetches and
 * reduces it to per-customer net totals without holding all orders in memory.
 *
 * @module
 */

/** Lifecycle state of an order; only `paid` and `refunded` affect totals. */
export type OrderStatus = 'paid' | 'refunded' | 'pending';

/** A single order as returned by the order source. */
export type Order = {
  readonly id: string;
  readonly customerId: string;
  readonly amountCents: number;
  readonly status: OrderStatus;
};

/** One page of orders; `nextPage` is `null` on the last page. */
export interface OrderPage {
  readonly items: readonly Order[];
  readonly nextPage: number | null;
}

/** Fetches one page of orders. Pages are 1-based. */
export type FetchPage = (page: number) => Promise<OrderPage>;

/** Retry tuning for page fetches. */
export interface SummarizeOptions {
  /** Extra attempts after the first failure of a page fetch. Default 3. */
  readonly retries?: number;
  /** Delay before the first retry; doubles on each subsequent retry. Default 100. */
  readonly baseDelayMs?: number;
}

/** Net paid-minus-refunded amount for one customer. */
export interface CustomerTotal {
  readonly customerId: string;
  readonly totalCents: number;
}

/** Result of {@link summarizeOrders}. */
export interface OrderSummary {
  /** Sorted by `totalCents` descending, then `customerId` ascending. */
  readonly totals: CustomerTotal[];
  /** Number of orders with status `pending`, which are excluded from totals. */
  readonly skippedPending: number;
}

const FIRST_PAGE = 1;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;
const BACKOFF_FACTOR = 2;

/**
 * Fetches every page from `fetchPage` and sums each customer's paid minus refunded cents.
 *
 * Pages are fetched sequentially because each page names the next one. Orders are folded
 * into running totals page by page, so memory grows with the number of customers, not orders.
 *
 * @param fetchPage - Page source, starting at page 1 and following `nextPage` until `null`.
 * @param opts - Retry count and base backoff delay; see {@link SummarizeOptions}.
 * @returns Per-customer totals and the count of skipped pending orders.
 * @throws {RangeError} If `retries` or `baseDelayMs` is not a non-negative integer.
 * @throws {Error} If a page still fails after all retries (`cause` is the last failure),
 *   if a page response or order is malformed, or if pagination revisits a page.
 */
export async function summarizeOrders(
  fetchPage: FetchPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  assertNonNegativeInteger('retries', retries);
  assertNonNegativeInteger('baseDelayMs', baseDelayMs);

  const totalsByCustomer = new Map<string, number>();
  const visitedPages = new Set<number>();
  let skippedPending = 0;
  let page: number | null = FIRST_PAGE;

  while (page !== null) {
    if (visitedPages.has(page)) {
      throw new Error(`Pagination cycle: page ${page} was already fetched`);
    }
    visitedPages.add(page);

    // Sequential by necessity: the next page number comes from this response.
    const response = await fetchPageWithRetry(fetchPage, page, retries, baseDelayMs);
    assertValidPage(page, response);

    for (const order of response.items) {
      assertValidOrder(page, order);
      switch (order.status) {
        case 'paid':
          addToTotal(totalsByCustomer, order.customerId, order.amountCents);
          break;
        case 'refunded':
          addToTotal(totalsByCustomer, order.customerId, -order.amountCents);
          break;
        case 'pending':
          skippedPending++;
          break;
        default: {
          const unhandled: never = order.status;
          throw new Error(`Unhandled order status: ${String(unhandled)}`);
        }
      }
    }
    page = response.nextPage;
  }

  return { totals: sortTotals(totalsByCustomer), skippedPending };
}

async function fetchPageWithRetry(
  fetchPage: FetchPage,
  page: number,
  retries: number,
  baseDelayMs: number,
): Promise<OrderPage> {
  let lastFailure: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await sleep(baseDelayMs * BACKOFF_FACTOR ** (attempt - 1));
    }
    try {
      return await fetchPage(page);
    } catch (e) {
      lastFailure = e;
    }
  }
  throw new Error(`Failed to fetch page ${page} after ${retries + 1} attempts`, {
    cause: lastFailure,
  });
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function addToTotal(totals: Map<string, number>, customerId: string, deltaCents: number): void {
  totals.set(customerId, (totals.get(customerId) ?? 0) + deltaCents);
}

function sortTotals(totals: ReadonlyMap<string, number>): CustomerTotal[] {
  const entries = Array.from(totals, ([customerId, totalCents]) => ({ customerId, totalCents }));
  // Code-unit comparison rather than localeCompare: deterministic regardless of runtime locale.
  return entries.sort(
    (a, b) =>
      b.totalCents - a.totalCents ||
      (a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0),
  );
}

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
  }
}

function assertValidPage(page: number, response: OrderPage): void {
  if (!Array.isArray(response?.items)) {
    throw new Error(`Page ${page} response has no items array`);
  }
  const { nextPage } = response;
  if (nextPage !== null && !Number.isSafeInteger(nextPage)) {
    throw new Error(`Page ${page} has invalid nextPage: ${String(nextPage)}`);
  }
}

function assertValidOrder(page: number, order: Order): void {
  if (typeof order.customerId !== 'string') {
    throw new Error(`Order ${order.id} on page ${page} has no customerId`);
  }
  if (!Number.isSafeInteger(order.amountCents)) {
    throw new Error(`Order ${order.id} on page ${page} has non-integer amountCents`);
  }
}
