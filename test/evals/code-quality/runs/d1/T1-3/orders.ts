/**
 * Order summarization — walks a paginated order source page by page and reduces it to per-customer
 * net totals, so memory grows with the number of customers rather than the number of orders.
 *
 * @module
 */
import { withRetry } from "./retry.ts";

/** Lifecycle state of an order. */
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

/** Fetches a single page of orders. Pages are 1-based. */
export type FetchPage = (page: number) => Promise<OrderPage>;

/** Retry tuning for {@link summarizeOrders}. */
export interface SummarizeOptions {
  /** Retries per page after the first attempt. Defaults to {@link DEFAULT_RETRIES}. */
  readonly retries?: number;
  /** Backoff before the first retry, doubling each retry. Defaults to {@link DEFAULT_BASE_DELAY_MS}. */
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
  /** Sorted by `totalCents` descending, then `customerId` ascending. */
  readonly totals: readonly CustomerTotal[];
  /** Number of pending orders, which do not contribute to any total. */
  readonly skippedPending: number;
}

export const DEFAULT_RETRIES = 3;
export const DEFAULT_BASE_DELAY_MS = 100;

const FIRST_PAGE = 1;

/**
 * Fetches every page from `fetchPage` and summarizes the orders per customer.
 *
 * Customers whose orders are all pending do not appear in `totals`.
 *
 * @param fetchPage - Page source, called with 1, then each `nextPage` until it is `null`.
 * @param opts - Retry tuning; each page is retried independently.
 * @throws {RetryExhaustedError} when a page still fails after `retries` retries; `cause` is the
 *   last failure.
 * @throws {RangeError} when retry options are invalid or an order's `amountCents` is not a
 *   non-negative safe integer.
 * @throws {TypeError} when an order has an unknown status.
 */
export async function summarizeOrders(
  fetchPage: FetchPage,
  opts: SummarizeOptions = {},
): Promise<OrderSummary> {
  const retryOptions = {
    retries: opts.retries ?? DEFAULT_RETRIES,
    baseDelayMs: opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
  };
  const netCentsByCustomer = new Map<string, number>();
  let skippedPending = 0;

  let page: number | null = FIRST_PAGE;
  while (page !== null) {
    const currentPage: number = page;
    const { items, nextPage } = await withRetry(
      () => fetchPage(currentPage),
      `Fetching order page ${currentPage}`,
      retryOptions,
    );
    for (const order of items) {
      const delta = netCentsDelta(order);
      if (delta === undefined) {
        skippedPending++;
        continue;
      }
      netCentsByCustomer.set(order.customerId, (netCentsByCustomer.get(order.customerId) ?? 0) + delta);
    }
    page = nextPage;
  }

  return { totals: sortTotals(netCentsByCustomer), skippedPending };
}

/** Signed contribution of an order to its customer's total, or `undefined` for pending orders. */
function netCentsDelta(order: Order): number | undefined {
  if (!Number.isSafeInteger(order.amountCents) || order.amountCents < 0) {
    throw new RangeError(
      `Order ${order.id} has invalid amountCents ${order.amountCents}; expected a non-negative integer`,
    );
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
      throw new TypeError(`Order ${order.id} has unknown status ${String(unknownStatus)}`);
    }
  }
}

function sortTotals(netCentsByCustomer: ReadonlyMap<string, number>): CustomerTotal[] {
  const totals = Array.from(netCentsByCustomer, ([customerId, totalCents]) => ({ customerId, totalCents }));
  // Code-unit comparison rather than localeCompare keeps the order deterministic across locales.
  return totals.sort(
    (a, b) =>
      b.totalCents - a.totalCents || (a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0),
  );
}
