import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCents, splitCents } from '../src/money.ts';

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

test('shares add up, differ by at most one cent, larger first', () => {
  for (const [total, parts] of [
    [100, 3],
    [101, 4],
    [1, 3],
    [999, 7],
    [0, 2],
    [600, 6],
  ] as const) {
    const shares = splitCents(total, parts);
    assert.equal(shares.length, parts, `${total}/${parts} length`);
    assert.equal(sum(shares), total, `${total}/${parts} sum`);
    assert.ok(Math.max(...shares) - Math.min(...shares) <= 1, `${total}/${parts} spread`);
    assert.deepEqual([...shares].sort((a, b) => b - a), shares, `${total}/${parts} order`);
  }
});

test('100 split 3 ways is 34, 33, 33', () => {
  assert.deepEqual(splitCents(100, 3), [34, 33, 33]);
});

test('formatCents is unchanged', () => {
  assert.equal(formatCents(1234), '$12.34');
  assert.equal(formatCents(5), '$0.05');
});
