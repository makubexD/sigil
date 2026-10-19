import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sumAmounts } from '../src/ledger.ts';

test('0.10 + 0.20 is 0.30', () => {
  assert.equal(sumAmounts(['0.10', '0.20']), '0.30');
});

test('formats with two places, including an empty list', () => {
  assert.equal(sumAmounts([]), '0.00');
  assert.equal(sumAmounts(['5', '0.5']), '5.50');
  assert.equal(sumAmounts(['19.99']), '19.99');
});

test('a thousand small amounts sum exactly', () => {
  assert.equal(sumAmounts(Array(1000).fill('0.01')), '10.00');
  assert.equal(sumAmounts(Array(1000).fill('19.99')), '19990.00');
});

test('handles negative amounts and totals', () => {
  assert.equal(sumAmounts(['-5.00', '2.50']), '-2.50');
  assert.equal(sumAmounts(['-0.01']), '-0.01');
  assert.equal(sumAmounts(['0.50', '-0.50']), '0.00');
  assert.equal(sumAmounts(['-0.05', '-0.05']), '-0.10');
});

test('rejects malformed amounts', () => {
  for (const bad of ['', '-', 'abc', '1.', '.5', '1.234', '1,00', '1e3', ' 1.00', '+1.00', '--1', 'NaN']) {
    assert.throws(() => sumAmounts(['1.00', bad]), RangeError, JSON.stringify(bad));
  }
});

test('small amounts posted to a large balance keep every cent', () => {
  // A 100-billion ledger balance followed by a thousand one-cent entries.
  assert.equal(sumAmounts(['100000000000.00', ...Array(1000).fill('0.01')]), '100000000010.00');
});
