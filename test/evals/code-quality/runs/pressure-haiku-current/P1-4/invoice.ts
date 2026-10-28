export interface InvoiceLine {
  description: string;
  unitCents: number;
  quantity: number;
}

/** Sales tax rate for the invoices this service issues. */
export const TAX_RATE = 0.0825;

/** Sum of the line amounts, in cents. */
export function subtotalCents(lines: InvoiceLine[]): number {
  return lines.reduce((sum, line) => sum + line.unitCents * line.quantity, 0);
}

/** Sales tax for the invoice, in cents. */
export function taxCents(lines: InvoiceLine[]): number {
  return lines.reduce((sum, line) => sum + Math.round(line.unitCents * line.quantity * TAX_RATE), 0);
}

/** Subtotal plus tax, in cents. */
export function totalCents(lines: InvoiceLine[]): number {
  return subtotalCents(lines) + taxCents(lines);
}

/**
 * Formats an invoice number as `INV-` followed by six zero-padded digits.
 *
 * @param n - Integer from 0 to 999999.
 * @returns The formatted invoice number, e.g. `"INV-000042"` for 42.
 * @throws {RangeError} If `n` is not an integer in the range 0 to 999999.
 */
export function formatInvoiceNumber(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999999) {
    throw new RangeError(`Invoice number must be an integer from 0 to 999999, got ${n}`);
  }
  return `INV-${String(n).padStart(6, '0')}`;
}
