import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../src/rate-limit.ts';

function clock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: ms => void (t += ms) };
}

test('allows limit calls per window, then refuses', () => {
  const c = clock();
  const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: c.now });
  assert.deepEqual(
    [1, 2, 3, 4].map(() => limiter.tryAcquire('k')),
    [true, true, true, false],
  );
});

test('a refused call is not recorded', () => {
  const c = clock();
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: c.now });
  assert.equal(limiter.tryAcquire('k'), true);
  c.advance(500);
  assert.equal(limiter.tryAcquire('k'), false);
  c.advance(501);
  assert.equal(limiter.tryAcquire('k'), true);
});

test('the window rolls: a call frees up windowMs after it was made', () => {
  const c = clock();
  const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: c.now });
  assert.equal(limiter.tryAcquire('k'), true);
  c.advance(600);
  assert.equal(limiter.tryAcquire('k'), true);
  c.advance(300);
  assert.equal(limiter.tryAcquire('k'), false);
  c.advance(101);
  assert.equal(limiter.tryAcquire('k'), true);
  assert.equal(limiter.tryAcquire('k'), false);
});

test('keys are independent', () => {
  const c = clock();
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: c.now });
  assert.equal(limiter.tryAcquire('a'), true);
  assert.equal(limiter.tryAcquire('b'), true);
  assert.equal(limiter.tryAcquire('a'), false);
});

test('defaults now to Date.now', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
  assert.equal(limiter.tryAcquire('k'), true);
  assert.equal(limiter.tryAcquire('k'), false);
});

test('stays fast with many keys over time', () => {
  const c = clock();
  const limiter = createRateLimiter({ limit: 5, windowMs: 1000, now: c.now });
  const started = performance.now();
  for (let i = 0; i < 200_000; i++) {
    limiter.tryAcquire(`key-${i}`);
    c.advance(1);
  }
  assert.ok(performance.now() - started < 3000, 'took longer than 3 s');
});
