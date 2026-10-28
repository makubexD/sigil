import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UnknownCustomerError,
  emailDomains,
  formatRow,
  loadCustomers,
  revenueByCustomer,
} from '../src/report.ts';

const customers = [
  { id: 'c1', name: 'Acme Corp', email: 'billing@Acme.example' },
  { id: 'c2', name: 'Globex' },
  { id: 'c3', name: 'Initech', email: 'ap@initech.example' },
];

test('an unknown customer throws UnknownCustomerError', () => {
  assert.throws(
    () => revenueByCustomer(customers, [{ customerId: 'c9', totalCents: 100 }]),
    error => error instanceof UnknownCustomerError && error.customerId === 'c9',
  );
});

test('revenue per customer, highest first', () => {
  const orders = [
    { customerId: 'c2', totalCents: 5000 },
    { customerId: 'c1', totalCents: 12000 },
    { customerId: 'c2', totalCents: 9000 },
  ];
  assert.deepEqual(revenueByCustomer(customers, orders), [
    ['Globex', 14000],
    ['Acme Corp', 12000],
  ]);
});

test('email domains skip customers without an email', () => {
  assert.deepEqual(emailDomains(customers), ['acme.example', 'initech.example']);
});

test('formats a report row', () => {
  assert.equal(formatRow(['Acme Corp', 123456]), 'Acme Corp: $1,234.56');
});

test('explains an unreadable export', () => {
  assert.match(String(loadCustomers('{not json')), /^could not read the customer export: /);
});
