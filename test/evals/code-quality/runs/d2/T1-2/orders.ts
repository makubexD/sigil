/**
 * Order summarization over a paginated source: per-customer net cents (paid minus refunded),
 * with retrying page fetches. Pages are folded into running totals one at a time, so memory
 * scales with the number of customers rather than the number of orders.
 *
 * @module
 */

/** Lifecycle state of an order. Only `paid` and `refunded` affect totals. */
export type OrderStatus = "paid" | "refunded" | "pending";

/** A single order as returned by the paginated source. */
export interface Order {
  readonly id: string;
  readonly customerId: string;
  /** Order amount in integer cents; always non-negative, the status decides its sign. */
  readonly amountCents: number;
  readonly status: OrderStatus;
}

/** One page of orders. `nextPage` is `null` on the last page. */
export interface OrderPage {
  readonly items: readonly Order[];
  readonly nextPage: number | null;
}

/** Fetches one page of orders; pages are 1-based. */
export type FetchPage = (page: number) => Promise<OrderPage>;

/** Retry tuning for {@link summarizeOrders}. */
export interface SummarizeOptions {
  /** Retries per page after the first failed attempt. Default 3. */
  readonly retries?: number;
  /** Delay before the first retry; doubles on each subsequent retry. Default 100 ms. */
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
  /** Number of pending orders seen; they do not contribute to totals. */
  readonly skippedPending: number;
}

const FIRST_PAGE = 1;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;

/**
 * Walks every page from page 1 and summarizes orders per customer.
 *
 * A customer appears in `totals` once they have at least one paid or refunded order; customers
 * with only pending orders are counted in `skippedPending` but not listed.
 *
 * @param fetchPage - Page source; called sequentially because each page names the next.
 * @param opts - Retry tuning; see {@link SummarizeOptions}.
 * @returns Per-customer totals and the pending-order count.
 * @throws {RangeError} If `opts` holds a negative or non-integer retry count or a negative delay.
 * @throws {TypeError} If an order has an unknown status or a non-integer / negative amount.
 * @throws {Error} If a page still fails after all retries (`cause` is the last failure), if a
 *   page number repeats, or if a customer's total leaves the safe-integer range.
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

  while (page !== null) {
    // A source that points back at an earlier page would otherwise loop forever.
    if (visitedPages.has(page)) {
      throw new Error(`Page ${page} was returned as nextPage more than once`);
    }
    visitedPages.add(page);

    const { items, nextPage } = await fetchWithRetry(fetchPage, page, retries, baseDelayMs);
    for (const order of items) {
      skippedPending += applyOrder(totalsByCustomer, order);
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
    if (attempt > 0) {
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
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

/** Folds one order into the running totals; returns 1 if it was pending, else 0. */
function applyOrder(totalsByCustomer: Map<string, number>, order: Order): number {
  const { amountCents, status, customerId } = order;
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new TypeError(`Order ${order.id} has invalid amountCents: ${amountCents}`);
  }

  let delta: number;
  switch (status) {
    case "pending":
      return 1;
    case "paid":
      delta = amountCents;
      break;
    case "refunded":
      delta = -amountCents;
      break;
    default: {
      const unknownStatus: never = status;
      throw new TypeError(`Order ${order.id} has unknown status: ${String(unknownStatus)}`);
    }
  }

  const total = (totalsByCustomer.get(customerId) ?? 0) + delta;
  if (!Number.isSafeInteger(total)) {
    throw new Error(`Total for customer ${customerId} exceeds the safe integer range`);
  }
  totalsByCustomer.set(customerId, total);
  return 0;
}

// Resolves the global setTimeout at call time so fake timers can intercept it.
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sortTotals(totalsByCustomer: Map<string, number>): CustomerTotal[] {
  const totals: CustomerTotal[] = [];
  for (const [customerId, totalCents] of totalsByCustomer) {
    totals.push({ customerId, totalCents });
  }
  // Code-unit comparison rather than localeCompare keeps the order locale-independent.
  return totals.sort(
    (a, b) =>
      b.totalCents - a.totalCents ||
      (a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0),
  );
}
