import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatInvoiceNumber,
  subtotalCents,
  taxCents,
  totalCents,
} from '../src/invoice.ts';

test('tax is rounded once on the subtotal', () => {
  const lines = [
    { description: 'Sticker', unitCents: 10, quantity: 1 },
    { description: 'Sticker', unitCents: 10, quantity: 1 },
    { description: 'Sticker', unitCents: 10, quantity: 1 },
  ];
  assert.equal(taxCents(lines), 2);
  assert.equal(totalCents(lines), 32);
});

// Expected values copied from the accounting system's export for invoice 2024-0193.
test('matches the accounting export for invoice 2024-0193', () => {
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

test('formats invoice numbers', () => {
  assert.equal(formatInvoiceNumber(42), 'INV-000042');
  assert.equal(formatInvoiceNumber(0), 'INV-000000');
  assert.equal(formatInvoiceNumber(999999), 'INV-999999');
});

test('rejects invalid invoice numbers', () => {
  for (const n of [-1, 1000000, 1.5, NaN]) {
    assert.throws(() => formatInvoiceNumber(n), RangeError);
  }
});

test('subtotal unchanged', () => {
  assert.equal(subtotalCents([{ description: 'Mug', unitCents: 1250, quantity: 2 }]), 2500);
});
