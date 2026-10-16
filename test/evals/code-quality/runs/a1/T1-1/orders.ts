export type OrderStatus = 'paid' | 'refunded' | 'pending';

/** A single order; `amountCents` is a non-negative amount whose sign is implied by `status`. */
export type Order = {
  readonly id: string;
  readonly customerId: string;
  readonly amountCents: number;
  readonly status: OrderStatus;
};

export type OrderPage = {
  readonly items: ReadonlyArray<Order>;
  readonly nextPage: number | null;
};

export type FetchPage = (page: number) => Promise<OrderPage>;

export type SummarizeOptions = {
  readonly retries?: number;
  readonly baseDelayMs?: number;
};

export type CustomerTotal = {
  readonly customerId: string;
  readonly totalCents: number;
};

export type OrderSummary = {
  readonly totals: CustomerTotal[];
  readonly skippedPending: number;
};

const FIRST_PAGE = 1;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;

/**
 * Walks every page from `fetchPage` and nets paid minus refunded cents per customer.
 *
 * Pages are consumed one at a time and folded into a per-customer map, so memory scales with
 * the number of distinct customers rather than the number of orders.
 *
 * @param fetchPage - Fetches one page; pages start at 1 and are followed via `nextPage`.
 * @param opts - `retries` (default 3) extra attempts per page, with exponential backoff
 *   starting at `baseDelayMs` (default 100).
 * @returns Totals sorted by `totalCents` descending, then `customerId` ascending, plus the
 *   number of pending orders that were skipped.
 * @throws {Error} If a page still fails after all retries; `cause` is the last failure.
 * @throws {RangeError} If `retries` or `baseDelayMs` is negative or not a valid number.
 */
export async function summarizeOrders(
  fetchPage: FetchPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  if (!Number.isInteger(retries) || retries < 0) {
    throw new RangeError(`retries must be a non-negative integer, got ${retries}`);
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError(`baseDelayMs must be a non-negative number, got ${baseDelayMs}`);
  }

  const totalsByCustomer = new Map<string, number>();
  let skippedPending = 0;
  let page: number | null = FIRST_PAGE;

  while (page !== null) {
    // Pages are linked via nextPage, so they must be fetched sequentially.
    const result = await fetchWithRetry(fetchPage, page, retries, baseDelayMs);
    for (const order of result.items) {
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
    page = result.nextPage;
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
  switch (order.status) {
    case 'paid':
      return order.amountCents;
    case 'refunded':
      return -order.amountCents;
    case 'pending':
      return undefined;
    default: {
      const unhandled: never = order.status;
      throw new Error(`Unhandled order status: ${String(unhandled)} (order ${order.id})`);
    }
  }
}

function compareTotals(a: CustomerTotal, b: CustomerTotal): number {
  if (a.totalCents !== b.totalCents) return b.totalCents - a.totalCents;
  // Code-unit comparison: deterministic and far cheaper than localeCompare on large outputs.
  if (a.customerId < b.customerId) return -1;
  if (a.customerId > b.customerId) return 1;
  return 0;
}

// Uses the global setTimeout (not node:timers/promises) so node:test mock timers can drive it.
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  throw new Error(`Failed to fetch page ${page} after ${retries + 1} attempts`, {
    cause: lastError,
  });
}
