export type OrderStatus = 'paid' | 'refunded' | 'pending';

export interface Order {
  readonly id: string;
  readonly customerId: string;
  /** Non-negative integer amount; `status` decides whether it adds to or subtracts from the total. */
  readonly amountCents: number;
  readonly status: OrderStatus;
}

export interface OrderPage {
  readonly items: readonly Order[];
  readonly nextPage: number | null;
}

export type FetchPage = (page: number) => Promise<OrderPage>;

export interface SummarizeOptions {
  /** Retries per page after the first failed attempt. Default 3. */
  readonly retries?: number;
  /** Delay before the first retry; doubles on each subsequent retry. Default 100. */
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

interface RetryPolicy {
  readonly retries: number;
  readonly baseDelayMs: number;
}

const FIRST_PAGE = 1;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;

/**
 * Streams every page from `fetchPage` and nets paid minus refunded cents per customer.
 * Memory grows with the number of distinct customers, not the number of orders.
 *
 * @throws Error when a page still fails after `retries` retries; `cause` is the last failure.
 */
export async function summarizeOrders(
  fetchPage: FetchPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const policy = toRetryPolicy(opts);
  const totalsByCustomer = new Map<string, number>();
  let skippedPending = 0;

  // Sequential by necessity: each page number comes from the previous response.
  for (let page: number | null = FIRST_PAGE; page !== null; ) {
    const { items, nextPage } = await fetchWithRetry(fetchPage, page, policy);
    skippedPending += accumulate(items, totalsByCustomer);
    page = nextPage;
  }

  return { totals: sortTotals(totalsByCustomer), skippedPending };
}

function toRetryPolicy(opts: SummarizeOptions): RetryPolicy {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  if (!Number.isInteger(retries) || retries < 0) {
    throw new RangeError(`retries must be a non-negative integer, got ${retries}`);
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError(`baseDelayMs must be a non-negative finite number, got ${baseDelayMs}`);
  }
  return { retries, baseDelayMs };
}

async function fetchWithRetry(
  fetchPage: FetchPage,
  page: number,
  policy: RetryPolicy,
): Promise<OrderPage> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchPage(page);
    } catch (error) {
      if (attempt >= policy.retries) {
        throw new Error(`Failed to fetch order page ${page} after ${attempt + 1} attempts`, {
          cause: error,
        });
      }
      await sleep(policy.baseDelayMs * 2 ** attempt);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Adds settled orders into `totals` and returns how many pending orders were skipped. */
function accumulate(items: readonly Order[], totals: Map<string, number>): number {
  let pending = 0;
  for (const order of items) {
    switch (order.status) {
      case 'pending':
        pending++;
        break;
      case 'paid':
        addCents(totals, order, 1);
        break;
      case 'refunded':
        addCents(totals, order, -1);
        break;
      default: {
        const unknownStatus: never = order.status;
        throw new Error(`Order ${order.id} has unknown status ${String(unknownStatus)}`);
      }
    }
  }
  return pending;
}

function addCents(totals: Map<string, number>, order: Order, sign: 1 | -1): void {
  if (!Number.isSafeInteger(order.amountCents) || order.amountCents < 0) {
    throw new RangeError(`Order ${order.id} has invalid amountCents ${order.amountCents}`);
  }
  const total = (totals.get(order.customerId) ?? 0) + sign * order.amountCents;
  if (!Number.isSafeInteger(total)) {
    throw new RangeError(`Total for customer ${order.customerId} exceeds safe integer range`);
  }
  totals.set(order.customerId, total);
}

function sortTotals(totals: ReadonlyMap<string, number>): CustomerTotal[] {
  return Array.from(totals, ([customerId, totalCents]) => ({ customerId, totalCents })).sort(
    byTotalDescThenCustomerIdAsc,
  );
}

function byTotalDescThenCustomerIdAsc(a: CustomerTotal, b: CustomerTotal): number {
  if (a.totalCents !== b.totalCents) return b.totalCents - a.totalCents;
  if (a.customerId === b.customerId) return 0;
  return a.customerId < b.customerId ? -1 : 1;
}
