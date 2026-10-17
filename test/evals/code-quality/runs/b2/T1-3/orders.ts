/**
 * Order summarization — walks a paginated order source, retrying failed page fetches with
 * exponential backoff, and folds orders into per-customer net totals without holding every
 * order in memory.
 *
 * @module
 */

/** Lifecycle state of an order; only `paid` and `refunded` affect totals. */
export type OrderStatus = "paid" | "refunded" | "pending";

/** A single order as returned by the order source. */
export interface Order {
  readonly id: string;
  readonly customerId: string;
  /** Order amount in integer cents; for `refunded` orders, the amount refunded. */
  readonly amountCents: number;
  readonly status: OrderStatus;
}

/** One page of orders; `nextPage` is `null` on the last page. */
export interface OrderPage {
  readonly items: readonly Order[];
  readonly nextPage: number | null;
}

/** Fetches one page of orders. Pages are 1-based. */
export type FetchPage = (page: number) => Promise<OrderPage>;

/** Retry tuning for {@link summarizeOrders}. */
export interface SummarizeOptions {
  /** Retries per page after the first failed attempt. Default 3. */
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
  /** Number of `pending` orders, which are excluded from totals. */
  readonly skippedPending: number;
}

const FIRST_PAGE = 1;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;

/**
 * Fetches every page of orders and summarizes net cents per customer.
 *
 * Pages are fetched sequentially because each response names the next page. Orders are
 * aggregated page by page, so memory grows with the number of customers, not orders.
 * Customers whose only orders are pending do not appear in `totals`.
 *
 * @param fetchPage - Order source; called with page 1 first, then each `nextPage`.
 * @param opts - Retry count and base backoff delay in milliseconds.
 * @returns Per-customer totals and the count of skipped pending orders.
 * @throws {RangeError} If `retries` or `baseDelayMs` is not a non-negative integer.
 * @throws {Error} If a page still fails after all retries; `cause` is the last failure.
 * @throws {TypeError} If a page or order is malformed, or `nextPage` revisits a page.
 */
export async function summarizeOrders(
  fetchPage: FetchPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  assertNonNegativeInteger("retries", retries);
  assertNonNegativeInteger("baseDelayMs", baseDelayMs);

  const totalsByCustomer = new Map<string, number>();
  const visitedPages = new Set<number>();
  let skippedPending = 0;
  let page: number | null = FIRST_PAGE;

  while (page !== null) {
    visitedPages.add(page);
    const result = await fetchWithRetry(fetchPage, page, retries, baseDelayMs);
    assertValidPage(result, page);

    for (const order of result.items) {
      assertValidOrder(order, page);
      switch (order.status) {
        case "paid":
          addToCustomer(totalsByCustomer, order.customerId, order.amountCents);
          break;
        case "refunded":
          addToCustomer(totalsByCustomer, order.customerId, -order.amountCents);
          break;
        case "pending":
          skippedPending++;
          break;
        default: {
          const unhandled: never = order.status;
          throw new TypeError(`Order ${order.id} on page ${page} has unknown status: ${String(unhandled)}`);
        }
      }
    }

    const { nextPage } = result;
    if (nextPage !== null && visitedPages.has(nextPage)) {
      // A repeated page would loop forever and double-count its orders.
      throw new TypeError(`Page ${page} points to already-fetched page ${nextPage}`);
    }
    page = nextPage;
  }

  return { totals: sortTotals(totalsByCustomer), skippedPending };
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
  throw new Error(`Failed to fetch page ${page} after ${retries + 1} attempts`, { cause: lastError });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addToCustomer(totals: Map<string, number>, customerId: string, deltaCents: number): void {
  totals.set(customerId, (totals.get(customerId) ?? 0) + deltaCents);
}

function sortTotals(totalsByCustomer: ReadonlyMap<string, number>): CustomerTotal[] {
  const totals = Array.from(totalsByCustomer, ([customerId, totalCents]) => ({ customerId, totalCents }));
  // Code-unit comparison keeps the order deterministic and locale-independent.
  return totals.sort(
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

function assertValidPage(result: OrderPage, page: number): void {
  if (!Array.isArray(result?.items)) {
    throw new TypeError(`Page ${page} response has no items array`);
  }
  const { nextPage } = result;
  if (nextPage !== null && !(Number.isSafeInteger(nextPage) && nextPage >= FIRST_PAGE)) {
    throw new TypeError(`Page ${page} has invalid nextPage: ${String(nextPage)}`);
  }
}

function assertValidOrder(order: Order, page: number): void {
  if (typeof order?.customerId !== "string") {
    throw new TypeError(`Order on page ${page} has no customerId`);
  }
  if (!Number.isSafeInteger(order.amountCents) || order.amountCents < 0) {
    throw new TypeError(`Order ${order.id} on page ${page} has invalid amountCents: ${order.amountCents}`);
  }
}
