import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPrice, legacyRound } from '../src/index.ts';

test('formats cents as dollars', () => {
  assert.equal(formatPrice(1250), '$12.50');
});

test('rounds half up to the nearest cent', () => {
  assert.equal(legacyRound(10.005), 10.01);
});
