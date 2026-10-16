export type OrderStatus = 'paid' | 'refunded' | 'pending';

export interface Order {
  readonly id: string;
  readonly customerId: string;
  readonly amountCents: number;
  readonly status: OrderStatus;
}

export interface OrderPage {
  readonly items: ReadonlyArray<Order>;
  readonly nextPage: number | null;
}

export type FetchPage = (page: number) => Promise<OrderPage>;

export interface SummarizeOptions {
  readonly retries?: number;
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

interface Accumulator {
  readonly centsByCustomer: Map<string, number>;
  skippedPending: number;
}

const FIRST_PAGE = 1;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;
const BACKOFF_FACTOR = 2;

/**
 * Walks every page from `fetchPage` and nets paid minus refunded cents per customer.
 * Orders are folded into running totals page by page, so memory scales with the number of
 * customers rather than the number of orders. Customers with only pending orders are omitted.
 *
 * @throws Error (with `cause` set to the last failure) when a page still fails after all retries.
 */
export async function summarizeOrders(
  fetchPage: FetchPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const policy = resolveRetryPolicy(opts);
  const acc: Accumulator = { centsByCustomer: new Map(), skippedPending: 0 };
  const visitedPages = new Set<number>();
  let page: number | null = FIRST_PAGE;
  while (page !== null) {
    if (visitedPages.has(page)) throw new Error(`Pagination cycle: page ${page} was already fetched`);
    visitedPages.add(page);
    // Pages are fetched sequentially because each response names the next page.
    const { items, nextPage }: OrderPage = await fetchWithRetry(fetchPage, page, policy);
    for (const order of items) applyOrder(acc, order);
    page = nextPage;
  }
  return { totals: sortTotals(acc.centsByCustomer), skippedPending: acc.skippedPending };
}

function resolveRetryPolicy(opts: SummarizeOptions): RetryPolicy {
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

async function fetchWithRetry(fetchPage: FetchPage, page: number, policy: RetryPolicy): Promise<OrderPage> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= policy.retries; attempt++) {
    if (attempt > 0) await sleep(policy.baseDelayMs * BACKOFF_FACTOR ** (attempt - 1));
    try {
      return await fetchPage(page);
    } catch (e) {
      lastError = e; // Recovered by the next attempt, or surfaced as `cause` below.
    }
  }
  throw new Error(`Failed to fetch orders page ${page} after ${policy.retries + 1} attempts`, {
    cause: lastError,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function applyOrder(acc: Accumulator, order: Order): void {
  if (!Number.isSafeInteger(order.amountCents) || order.amountCents < 0) {
    throw new RangeError(`Order ${order.id} has invalid amountCents: ${order.amountCents}`);
  }
  switch (order.status) {
    case 'paid':
      addCents(acc.centsByCustomer, order.customerId, order.amountCents);
      return;
    case 'refunded':
      addCents(acc.centsByCustomer, order.customerId, -order.amountCents);
      return;
    case 'pending':
      acc.skippedPending += 1;
      return;
    default: {
      const unknownStatus: never = order.status;
      throw new Error(`Order ${order.id} has unknown status: ${String(unknownStatus)}`);
    }
  }
}

function addCents(centsByCustomer: Map<string, number>, customerId: string, cents: number): void {
  centsByCustomer.set(customerId, (centsByCustomer.get(customerId) ?? 0) + cents);
}

function sortTotals(centsByCustomer: Map<string, number>): CustomerTotal[] {
  const totals = Array.from(centsByCustomer, ([customerId, totalCents]) => ({ customerId, totalCents }));
  return totals.sort(
    (a, b) => b.totalCents - a.totalCents || compareCodeUnits(a.customerId, b.customerId),
  );
}

// Plain code-unit ordering keeps results stable across locales, unlike localeCompare.
function compareCodeUnits(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
