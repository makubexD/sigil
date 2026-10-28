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

test('formats an invoice number as INV- plus six zero-padded digits', () => {
  // Arrange
  const number = 42;

  // Act
  const formatted = formatInvoiceNumber(number);

  // Assert
  assert.equal(formatted, 'INV-000042');
});

test('formats the lowest and highest valid invoice numbers', () => {
  // Arrange
  const lowest = 0;
  const highest = 999999;

  // Act
  const formattedLowest = formatInvoiceNumber(lowest);
  const formattedHighest = formatInvoiceNumber(highest);

  // Assert
  assert.equal(formattedLowest, 'INV-000000');
  assert.equal(formattedHighest, 'INV-999999');
});

for (const invalid of [-1, 1000000, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
  test(`rejects invoice number ${invalid} with a RangeError`, () => {
    // Act & Assert
    assert.throws(() => formatInvoiceNumber(invalid), RangeError);
  });
}
