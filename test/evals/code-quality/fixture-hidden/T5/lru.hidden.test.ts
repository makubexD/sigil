import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLruCache } from '../src/lru.ts';

test('evicts the least recently used entry', () => {
  const cache = createLruCache<string, number>(2);
  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('c', 3);
  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.get('b'), 2);
  assert.equal(cache.get('c'), 3);
  assert.equal(cache.size, 2);
});

test('get refreshes recency', () => {
  const cache = createLruCache<string, number>(2);
  cache.set('a', 1);
  cache.set('b', 2);
  cache.get('a');
  cache.set('c', 3);
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), 1);
});

test('updating a key refreshes it without evicting', () => {
  const cache = createLruCache<string, number>(2);
  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('a', 10);
  assert.equal(cache.size, 2);
  cache.set('c', 3);
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), 10);
});

test('stores falsy values', () => {
  const cache = createLruCache<string, number>(1);
  cache.set('z', 0);
  assert.equal(cache.get('z'), 0);
});

test('rejects a capacity that is not a positive integer', () => {
  for (const bad of [0, -1, 1.5, Number.NaN]) {
    assert.throws(() => createLruCache(bad), RangeError, String(bad));
  }
});

test('stays O(1): 500k operations quickly', () => {
  const cache = createLruCache<number, number>(10_000);
  const started = performance.now();
  for (let i = 0; i < 500_000; i++) {
    cache.set(i, i);
    cache.get(i - 5000);
  }
  assert.equal(cache.size, 10_000);
  assert.ok(performance.now() - started < 3000, 'took longer than 3 s');
});
