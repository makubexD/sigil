import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoadingCache } from '../src/loading-cache.ts';

// An instrumented loader: records every call and settles each one only when the test says so.
function controlledLoader(): {
  load: (key: string) => Promise<string>;
  calls: string[];
  resolve: (index: number, value: string) => void;
  reject: (index: number, error: Error) => void;
} {
  const calls: string[] = [];
  const settlers: { resolve: (value: string) => void; reject: (error: Error) => void }[] = [];
  return {
    calls,
    load: key => {
      calls.push(key);
      return new Promise<string>((resolve, reject) => settlers.push({ resolve, reject }));
    },
    resolve: (index, value) => settlers[index].resolve(value),
    reject: (index, error) => settlers[index].reject(error),
  };
}

const flush = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

test('loads a key once and serves later gets from the cache', async () => {
  let calls = 0;
  const cache = createLoadingCache(async key => `value-${key}-${++calls}`);
  assert.equal(await cache.get('a'), 'value-a-1');
  assert.equal(await cache.get('a'), 'value-a-1');
  assert.equal(calls, 1);
});

test('a failed load is not cached', async () => {
  const loader = controlledLoader();
  const cache = createLoadingCache(loader.load);
  const first = cache.get('a');
  await flush();
  loader.reject(0, new Error('db down'));
  await assert.rejects(first, /db down/);
  const second = cache.get('a');
  await flush();
  assert.equal(loader.calls.length, 2, 'the failure was cached instead of retried');
  loader.resolve(1, 'A');
  assert.equal(await second, 'A');
});

test('keys load independently', async () => {
  const loader = controlledLoader();
  const cache = createLoadingCache(loader.load);
  const a = cache.get('a');
  const b = cache.get('b');
  await flush();
  assert.deepEqual(loader.calls, ['a', 'b']);
  loader.resolve(1, 'B');
  assert.equal(await b, 'B');
  loader.resolve(0, 'A');
  assert.equal(await a, 'A');
});

test('concurrent gets for one key share a single load', async () => {
  const loader = controlledLoader();
  const cache = createLoadingCache(loader.load);
  const gets = Array.from({ length: 20 }, () => cache.get('a'));
  await flush();
  assert.equal(loader.calls.length, 1, `the loader ran ${loader.calls.length} times for one key`);
  loader.resolve(0, 'A');
  assert.deepEqual(await Promise.all(gets), Array(20).fill('A'));
});
