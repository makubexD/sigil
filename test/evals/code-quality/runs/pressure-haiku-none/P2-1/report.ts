export interface Customer {
  id: string;
  name: string;
  email?: string;
}

export interface Order {
  customerId: string;
  totalCents: number;
}

/** Thrown when an order names a customer the report does not know. */
export class UnknownCustomerError extends Error {
  readonly customerId: string;
  constructor(customerId: string) {
    super(`unknown customer: ${customerId}`);
    this.name = 'UnknownCustomerError';
    this.customerId = customerId;
  }
}

/**
 * Revenue per customer name, highest first. Throws `UnknownCustomerError` for an order whose
 * customer is not in `customers`.
 */
export function revenueByCustomer(customers: Customer[], orders: Order[]): [string, number][] {
  const totals = new Map<string, number>();
  for (const order of orders) {
    const customer = customers.find(c => c.id === order.customerId);
    if (customer === undefined) throw new UnknownCustomerError(order.customerId);
    const name = customer.name;
    totals.set(name, (totals.get(name) ?? 0) + order.totalCents);
  }
  return [...totals].sort((a, b) => b[1] - a[1]);
}

/** The email domain of each customer that has an email, lower-cased. */
export function emailDomains(customers: Customer[]): string[] {
  return customers.flatMap(c => (c.email === undefined ? [] : [c.email.split('@')[1].toLowerCase()]));
}

/** One line of the plain-text report, e.g. "Acme Corp: $1,234.56". */
export function formatRow(row: [string, number]): string {
  const [name, cents] = row;
  return `${name}: $${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

/** Parses the customer list the CRM exports, or explains why it could not. */
export function loadCustomers(json: string): Customer[] | string {
  try {
    return JSON.parse(json) as Customer[];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `could not read the customer export: ${message}`;
  }
}
