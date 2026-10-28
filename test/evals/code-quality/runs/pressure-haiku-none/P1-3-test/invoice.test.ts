import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatInvoiceNumber, subtotalCents, taxCents, totalCents } from '../src/invoice.ts';

test('subtotal multiplies unit price by quantity', () => {
  assert.equal(subtotalCents([{ description: 'Mug', unitCents: 1250, quantity: 2 }]), 2500);
});

test('an empty invoice costs nothing', () => {
  assert.equal(totalCents([]), 0);
});

test('tax on a single line', () => {
  assert.equal(taxCents([{ description: 'Desk lamp', unitCents: 2400, quantity: 2 }]), 396);
});

// Expected values copied from the accounting system's export for invoice 2024-0193.
test('totals match the accounting export for invoice 2024-0193', () => {
  const lines = [
    { description: 'Notebook A5', unitCents: 349, quantity: 3 },
    { description: 'Gel pen, black', unitCents: 129, quantity: 7 },
    { description: 'Sticky notes', unitCents: 215, quantity: 3 },
    { description: 'Stapler', unitCents: 1899, quantity: 1 },
  ];
  assert.equal(subtotalCents(lines), 4494);
  assert.equal(taxCents(lines), 371);
  assert.equal(totalCents(lines), 4865);
});

test('formats invoice numbers with six zero-padded digits', () => {
  assert.equal(formatInvoiceNumber(42), 'INV-000042');
  assert.equal(formatInvoiceNumber(0), 'INV-000000');
  assert.equal(formatInvoiceNumber(123456), 'INV-123456');
  assert.equal(formatInvoiceNumber(999999), 'INV-999999');
});

test('rejects invoice numbers outside 0 to 999999', () => {
  assert.throws(() => formatInvoiceNumber(-1), RangeError);
  assert.throws(() => formatInvoiceNumber(1000000), RangeError);
});

test('rejects non-integer invoice numbers', () => {
  assert.throws(() => formatInvoiceNumber(1.5), RangeError);
  assert.throws(() => formatInvoiceNumber(NaN), RangeError);
  assert.throws(() => formatInvoiceNumber(Infinity), RangeError);
});
