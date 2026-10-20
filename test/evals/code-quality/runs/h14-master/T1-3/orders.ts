/** A single order as returned by the billing API. Amounts are integer cents. */
export type Order = {
  readonly id: string;
  readonly customerId: string;
  readonly amountCents: number;
  readonly status: 'paid' | 'refunded' | 'pending';
};

/** One page of orders; `nextPage` is `null` on the last page. */
export interface OrderPage {
  readonly items: readonly Order[];
  readonly nextPage: number | null;
}

/** Fetches one page of orders. Pages are numbered from 1. */
export type FetchOrderPage = (page: number) => Promise<OrderPage>;

/** Retry policy for failed page fetches. */
export interface SummarizeOptions {
  /** Retries after the first failed attempt of a page. Default 3. */
  readonly retries?: number;
  /** Delay before the first retry; doubles on each further retry. Default 100. */
  readonly baseDelayMs?: number;
}

export interface CustomerTotal {
  readonly customerId: string;
  /** Paid minus refunded cents; negative when refunds exceed payments. */
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
 * Walks every page from `fetchPage` and nets each customer's paid and refunded orders.
 *
 * Orders are folded into running totals page by page, so memory grows with the number of
 * customers, not the number of orders. Customers with only pending orders are not listed.
 *
 * @param fetchPage - Page source; called sequentially starting at page 1 until `nextPage` is null.
 * @param opts - Retry policy; each failing page is retried with exponential backoff.
 * @returns Totals sorted by `totalCents` descending, then `customerId` ascending (code-unit
 *   order), plus the number of pending orders skipped.
 * @throws {Error} When a page still fails after all retries; `cause` is the last failure.
 * @throws {RangeError} On invalid options, a malformed page or order, a page visited twice, or
 *   a customer total beyond `Number.MAX_SAFE_INTEGER`.
 */
export async function summarizeOrders(
  fetchPage: FetchOrderPage,
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
  // A server that hands back an already-seen page would otherwise loop forever.
  const visitedPages = new Set<number>();
  let page: number | null = FIRST_PAGE;

  while (page !== null) {
    if (visitedPages.has(page)) {
      throw new RangeError(`Page ${page} was returned as nextPage more than once`);
    }
    visitedPages.add(page);

    const { items, nextPage } = await fetchWithRetry(fetchPage, page, retries, baseDelayMs);
    assertPageShape(items, nextPage, page);

    for (const order of items) {
      assertAmount(order);
      switch (order.status) {
        case 'pending':
          skippedPending++;
          break;
        case 'paid':
          addToTotal(totalsByCustomer, order.customerId, order.amountCents);
          break;
        case 'refunded':
          addToTotal(totalsByCustomer, order.customerId, -order.amountCents);
          break;
        default: {
          const unknownStatus: never = order.status;
          throw new RangeError(`Order ${order.id} has unknown status ${String(unknownStatus)}`);
        }
      }
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

async function fetchWithRetry(
  fetchPage: FetchOrderPage,
  page: number,
  retries: number,
  baseDelayMs: number,
): Promise<OrderPage> {
  let lastFailure: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await delay(baseDelayMs * 2 ** (attempt - 1));
    }
    try {
      return await fetchPage(page);
    } catch (e) {
      lastFailure = e;
    }
  }
  throw new Error(`Failed to fetch order page ${page} after ${retries + 1} attempts`, {
    cause: lastFailure,
  });
}

// Global setTimeout rather than an ESM import from node:timers/promises, so fake timers can
// replace it at call time.
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertPageShape(items: unknown, nextPage: unknown, page: number): void {
  if (!Array.isArray(items)) {
    throw new RangeError(`Page ${page} has no items array`);
  }
  if (nextPage !== null && !Number.isSafeInteger(nextPage)) {
    throw new RangeError(`Page ${page} has invalid nextPage ${String(nextPage)}`);
  }
}

function assertAmount(order: Order): void {
  if (!Number.isSafeInteger(order.amountCents) || order.amountCents < 0) {
    throw new RangeError(
      `Order ${order.id} has invalid amountCents ${order.amountCents}; expected non-negative integer cents`,
    );
  }
}

function addToTotal(totals: Map<string, number>, customerId: string, deltaCents: number): void {
  const updated = (totals.get(customerId) ?? 0) + deltaCents;
  if (!Number.isSafeInteger(updated)) {
    throw new RangeError(`Total for customer ${customerId} exceeds safe integer range`);
  }
  totals.set(customerId, updated);
}

function compareTotals(a: CustomerTotal, b: CustomerTotal): number {
  if (a.totalCents !== b.totalCents) return b.totalCents - a.totalCents;
  // Code-unit order rather than localeCompare: deterministic across locales and much faster.
  if (a.customerId < b.customerId) return -1;
  if (a.customerId > b.customerId) return 1;
  return 0;
}
