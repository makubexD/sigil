/**
 * Order summarization — walks a paginated order source and nets paid minus refunded cents per
 * customer, retrying failed page fetches with exponential backoff.
 *
 * @module
 */

/** Lifecycle state of an order. Only `paid` and `refunded` affect totals. */
export type OrderStatus = 'paid' | 'refunded' | 'pending';

/** A single order as returned by the order source. */
export interface Order {
  readonly id: string;
  readonly customerId: string;
  /** Order amount in integer cents; must be a non-negative safe integer. */
  readonly amountCents: number;
  readonly status: OrderStatus;
}

/** One page of orders; `nextPage` is `null` on the last page. */
export interface OrderPage {
  readonly items: readonly Order[];
  readonly nextPage: number | null;
}

/** Fetches one page of orders. Pages are numbered from 1. */
export type FetchPage = (page: number) => Promise<OrderPage>;

/** Retry tuning for {@link summarizeOrders}. */
export interface SummarizeOptions {
  /** Retries per page after the first failed attempt. Non-negative integer; default 3. */
  readonly retries?: number;
  /** Delay before the first retry in ms; doubles on each further retry. Default 100. */
  readonly baseDelayMs?: number;
}

/** Net total for one customer. */
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

/**
 * Fetches every page from `fetchPage` and summarizes the orders per customer.
 *
 * Pages are aggregated as they arrive and never retained, so memory grows with the number of
 * distinct customers rather than the number of orders. Customers whose only orders are pending
 * do not appear in `totals`; a customer whose refunds cancel their payments appears with `0`.
 *
 * @param fetchPage - Page source; page 1 is fetched first, then each `nextPage` until `null`.
 * @param opts - Retry count and base backoff delay.
 * @returns Per-customer net cents (paid minus refunded) and the number of pending orders.
 * @throws {RangeError} If `opts` holds an invalid value, or a running total leaves the safe
 *   integer range.
 * @throws {TypeError} If a page or order is malformed, or pagination revisits a page.
 * @throws {Error} If a page still fails after all retries; `cause` is the last failure.
 */
export async function summarizeOrders(
  fetchPage: FetchPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  if (!Number.isSafeInteger(retries) || retries < 0) {
    throw new RangeError(`retries must be a non-negative integer, got ${retries}`);
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError(`baseDelayMs must be a non-negative finite number, got ${baseDelayMs}`);
  }

  const totalsByCustomer = new Map<string, number>();
  const visitedPages = new Set<number>();
  let skippedPending = 0;
  let page: number | null = FIRST_PAGE;

  // Sequential by necessity: each page's number comes from the previous response.
  while (page !== null) {
    if (visitedPages.has(page)) {
      throw new TypeError(`Pagination cycle: page ${page} was already fetched`);
    }
    visitedPages.add(page);

    const result = await fetchWithRetry(fetchPage, page, retries, baseDelayMs);
    assertPage(result, page);
    for (const order of result.items) {
      skippedPending += applyOrder(totalsByCustomer, order);
    }
    page = result.nextPage;
  }

  return { totals: sortTotals(totalsByCustomer), skippedPending };
}

async function fetchWithRetry(
  fetchPage: FetchPage,
  page: number,
  retries: number,
  baseDelayMs: number,
): Promise<OrderPage> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchPage(page);
    } catch (e) {
      if (attempt >= retries) {
        throw new Error(`Failed to fetch page ${page} after ${attempt + 1} attempts`, { cause: e });
      }
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertPage(result: unknown, page: number): asserts result is OrderPage {
  const candidate = result as Partial<OrderPage> | null | undefined;
  if (!candidate || !Array.isArray(candidate.items)) {
    throw new TypeError(`Page ${page}: items must be an array`);
  }
  const { nextPage } = candidate;
  if (nextPage !== null && !Number.isSafeInteger(nextPage)) {
    throw new TypeError(`Page ${page}: nextPage must be an integer or null, got ${nextPage}`);
  }
}

/** Folds one order into the running totals; returns 1 if the order was pending, else 0. */
function applyOrder(totalsByCustomer: Map<string, number>, order: Order): number {
  if (!Number.isSafeInteger(order.amountCents) || order.amountCents < 0) {
    throw new TypeError(
      `Order ${order.id}: amountCents must be a non-negative integer, got ${order.amountCents}`,
    );
  }
  switch (order.status) {
    case 'pending':
      return 1;
    case 'paid':
      addToTotal(totalsByCustomer, order.customerId, order.amountCents);
      return 0;
    case 'refunded':
      addToTotal(totalsByCustomer, order.customerId, -order.amountCents);
      return 0;
    default: {
      const unknownStatus: never = order.status;
      throw new TypeError(`Order ${order.id}: unknown status ${String(unknownStatus)}`);
    }
  }
}

function addToTotal(totalsByCustomer: Map<string, number>, customerId: string, cents: number): void {
  const total = (totalsByCustomer.get(customerId) ?? 0) + cents;
  if (!Number.isSafeInteger(total)) {
    throw new RangeError(`Total for customer ${customerId} exceeds the safe integer range`);
  }
  totalsByCustomer.set(customerId, total);
}

function sortTotals(totalsByCustomer: Map<string, number>): CustomerTotal[] {
  const totals = Array.from(totalsByCustomer, ([customerId, totalCents]) => ({ customerId, totalCents }));
  // Plain code-unit comparison keeps ordering deterministic regardless of locale.
  return totals.sort(
    (a, b) =>
      b.totalCents - a.totalCents ||
      (a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0),
  );
}
