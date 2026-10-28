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

const INVOICE_NUMBER_PREFIX = 'INV-';
const INVOICE_NUMBER_DIGITS = 6;
const MAX_INVOICE_NUMBER = 10 ** INVOICE_NUMBER_DIGITS - 1;

/**
 * Formats an invoice sequence number as `INV-` followed by six zero-padded digits.
 *
 * @param n - Integer from 0 to 999999.
 * @returns The invoice number, e.g. `"INV-000042"` for 42.
 * @throws {RangeError} If n is not an integer from 0 to 999999.
 */
export function formatInvoiceNumber(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > MAX_INVOICE_NUMBER) {
    throw new RangeError(`invoice number must be an integer from 0 to ${MAX_INVOICE_NUMBER}, got ${n}`);
  }
  return INVOICE_NUMBER_PREFIX + String(n).padStart(INVOICE_NUMBER_DIGITS, '0');
}
