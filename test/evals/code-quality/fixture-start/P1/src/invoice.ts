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
