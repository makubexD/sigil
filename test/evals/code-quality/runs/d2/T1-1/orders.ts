/**
 * Order summarization — walks a paginated order source and nets paid against refunded cents
 * per customer, retrying failed page fetches with exponential backoff.
 *
 * @module
 */

/** Lifecycle state of an order. Only `paid` and `refunded` affect totals. */
export type OrderStatus = "paid" | "refunded" | "pending";

/** A single order as returned by the order source. */
export interface Order {
  readonly id: string;
  readonly customerId: string;
  /** Order amount in integer cents. */
  readonly amountCents: number;
  readonly status: OrderStatus;
}

/** One page of orders; `nextPage` is `null` on the last page. */
export interface OrderPage {
  readonly items: readonly Order[];
  readonly nextPage: number | null;
}

/** Fetches one page of orders by page number. */
export type FetchOrderPage = (page: number) => Promise<OrderPage>;

/** Retry tuning for {@link summarizeOrders}. */
export interface SummarizeOptions {
  /** Retries per page after the first failed attempt. Non-negative integer; default 3. */
  readonly retries?: number;
  /** Delay before the first retry; doubles on each subsequent retry. Default 100 ms. */
  readonly baseDelayMs?: number;
}

/** Net total for one customer. */
export interface CustomerTotal {
  readonly customerId: string;
  /** Paid cents minus refunded cents; may be negative. */
  readonly totalCents: number;
}

/** Result of {@link summarizeOrders}. */
export interface OrderSummary {
  readonly totals: CustomerTotal[];
  readonly skippedPending: number;
}

const FIRST_PAGE = 1;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;

/**
 * Fetches every page from `fetchPage`, starting at page 1, and summarizes the orders.
 *
 * Pages are fetched sequentially because each page names its successor. Orders are folded into a
 * per-customer map as each page arrives, so memory scales with the number of customers, not orders.
 *
 * @param fetchPage - Order source; called with 1, then each returned `nextPage` until `null`.
 * @param opts - Retry count and base backoff delay.
 * @returns Per-customer net totals sorted by `totalCents` descending, then `customerId` ascending,
 *   plus the number of pending orders skipped. Customers with only pending orders are omitted.
 * @throws {RangeError} If `retries` or `baseDelayMs` is invalid.
 * @throws {Error} If a page still fails after all retries (`cause` is the last failure), or an
 *   order has an unknown status or a non-integer `amountCents`.
 */
export async function summarizeOrders(
  fetchPage: FetchOrderPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  if (!Number.isInteger(retries) || retries < 0) {
    throw new RangeError(`retries must be a non-negative integer, got ${retries}`);
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError(`baseDelayMs must be a non-negative finite number, got ${baseDelayMs}`);
  }

  const totalsByCustomer = new Map<string, number>();
  let skippedPending = 0;
  let page: number | null = FIRST_PAGE;

  while (page !== null) {
    // Sequential by necessity: the next page number is only known once this page resolves.
    const { items, nextPage } = await fetchWithRetry(fetchPage, page, retries, baseDelayMs);
    for (const order of items) {
      const signedCents = signedAmount(order);
      if (signedCents === undefined) {
        skippedPending++;
        continue;
      }
      totalsByCustomer.set(
        order.customerId,
        (totalsByCustomer.get(order.customerId) ?? 0) + signedCents,
      );
    }
    page = nextPage;
  }

  const totals = Array.from(totalsByCustomer, ([customerId, totalCents]) => ({
    customerId,
    totalCents,
  }));
  totals.sort(compareTotals);
  return { totals, skippedPending };
}

/** Returns the order's contribution to its customer's total, or `undefined` for pending orders. */
function signedAmount(order: Order): number | undefined {
  if (!Number.isSafeInteger(order.amountCents)) {
    throw new Error(`Order ${order.id} has non-integer amountCents: ${order.amountCents}`);
  }
  switch (order.status) {
    case "paid":
      return order.amountCents;
    case "refunded":
      return -order.amountCents;
    case "pending":
      return undefined;
    default: {
      const unknownStatus: never = order.status;
      throw new Error(`Order ${order.id} has unknown status: ${String(unknownStatus)}`);
    }
  }
}

async function fetchWithRetry(
  fetchPage: FetchOrderPage,
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
  throw new Error(`Failed to fetch order page ${page} after ${retries + 1} attempts`, {
    cause: lastError,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Plain code-unit comparison: deterministic across locales and much cheaper than localeCompare.
function compareTotals(a: CustomerTotal, b: CustomerTotal): number {
  if (a.totalCents !== b.totalCents) return b.totalCents - a.totalCents;
  if (a.customerId < b.customerId) return -1;
  if (a.customerId > b.customerId) return 1;
  return 0;
}
