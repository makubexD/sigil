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

/** Invoice number as `INV-` followed by the sequence number zero-padded to 6 digits. */
export function formatInvoiceNumber(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999999) {
    throw new RangeError(`invoice number must be an integer from 0 to 999999, got ${n}`);
  }
  return `INV-${String(n).padStart(6, '0')}`;
}
