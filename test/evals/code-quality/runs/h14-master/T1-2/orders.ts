export type OrderStatus = "paid" | "refunded" | "pending";

export type Order = {
  id: string;
  customerId: string;
  amountCents: number;
  status: OrderStatus;
};

export interface OrderPage {
  readonly items: ReadonlyArray<Order>;
  readonly nextPage: number | null;
}

export type FetchPage = (page: number) => Promise<OrderPage>;

export interface SummarizeOptions {
  /** Retries per page after the first failed attempt. Default 3. */
  readonly retries?: number;
  /** Delay before the first retry; doubles on each further retry. Default 100. */
  readonly baseDelayMs?: number;
}

export interface CustomerTotal {
  readonly customerId: string;
  readonly totalCents: number;
}

export interface OrderSummary {
  readonly totals: CustomerTotal[];
  readonly skippedPending: number;
}

const FIRST_PAGE = 1;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;

/**
 * Walks every page from `fetchPage`, netting paid minus refunded cents per customer.
 *
 * Pages are fetched sequentially (each page names the next) and folded into a per-customer map as
 * they arrive, so memory grows with the number of customers, not the number of orders. Customers
 * whose only orders are pending do not appear in `totals`.
 *
 * @throws Error with `cause` set to the last failure when a page still fails after all retries.
 * @throws RangeError on invalid options or an order with a non-integer amount.
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
  let skippedPending = 0;
  let page: number | null = FIRST_PAGE;

  while (page !== null) {
    const { items, nextPage } = await fetchPageWithRetry(fetchPage, page, retries, baseDelayMs);
    for (const order of items) {
      if (!Number.isSafeInteger(order.amountCents)) {
        throw new RangeError(`Order ${order.id} has non-integer amountCents: ${order.amountCents}`);
      }
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

/** Contribution of an order to its customer's total, or `undefined` when it is not counted. */
function signedAmount(order: Order): number | undefined {
  switch (order.status) {
    case "paid":
      return order.amountCents;
    case "refunded":
      return -order.amountCents;
    case "pending":
      return undefined;
    default: {
      const unknownStatus: never = order.status;
      throw new RangeError(`Order ${order.id} has unknown status: ${String(unknownStatus)}`);
    }
  }
}

function compareTotals(a: CustomerTotal, b: CustomerTotal): number {
  if (a.totalCents !== b.totalCents) return b.totalCents - a.totalCents;
  // Code-unit order rather than localeCompare, so results don't depend on the host locale.
  if (a.customerId < b.customerId) return -1;
  if (a.customerId > b.customerId) return 1;
  return 0;
}

async function fetchPageWithRetry(
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
