import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { DeadlineError, withDeadline } from '../src/deadline.ts';

// An instrumented fake timer: nothing fires until advance(), and `pending` counts live timers.
function fakeTimers(): {
  setTimer: (callback: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  advance: (ms: number) => void;
  readonly pending: number;
} {
  let now = 0;
  let nextId = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  return {
    setTimer: (callback, ms) => {
      const id = ++nextId;
      timers.set(id, { at: now + ms, callback });
      return id;
    },
    clearTimer: handle => void timers.delete(handle as number),
    advance: ms => {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
    get pending() {
      return timers.size;
    },
  };
}

const flush = (): Promise<void> => new Promise(resolve => setImmediate(resolve));
const timed = (t: ReturnType<typeof fakeTimers>) =>
  ({ timeoutMs: 100, setTimer: t.setTimer, clearTimer: t.clearTimer });
const hang = (): Promise<never> => new Promise(() => {});

test('resolves with the operation value before the deadline', async () => {
  const t = fakeTimers();
  const result = withDeadline(async () => 42, timed(t));
  assert.equal(await result, 42);
});

test('passes an operation failure through unchanged', async () => {
  const t = fakeTimers();
  const failure = new Error('boom');
  await assert.rejects(
    withDeadline(async () => Promise.reject(failure), timed(t)),
    error => error === failure,
  );
});

test('rejects with DeadlineError at the deadline, not before', async () => {
  const t = fakeTimers();
  let settled = false;
  const result = withDeadline(hang, timed(t));
  result.then(
    () => (settled = true),
    () => (settled = true),
  );
  t.advance(99);
  await flush();
  assert.equal(settled, false);
  t.advance(1);
  await assert.rejects(result, DeadlineError);
});

test('uses the global timers by default', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const result = withDeadline(hang, { timeoutMs: 50 });
    mock.timers.tick(50);
    await assert.rejects(result, DeadlineError);
  } finally {
    mock.timers.reset();
  }
});

test('aborts the signal given to the operation at the deadline', async () => {
  const t = fakeTimers();
  const seen: AbortSignal[] = [];
  const result = withDeadline(
    signal => {
      seen.push(signal);
      return hang();
    },
    timed(t),
  );
  await flush();
  assert.equal(seen.length, 1, 'the operation was called once, with a signal');
  assert.equal(seen[0].aborted, false);
  t.advance(100);
  await assert.rejects(result, DeadlineError);
  assert.equal(seen[0].aborted, true, 'the hung operation was never told to stop');
});

test('clears its timer when the operation succeeds first', async () => {
  const t = fakeTimers();
  assert.equal(await withDeadline(async () => 'ok', timed(t)), 'ok');
  assert.equal(t.pending, 0, 'a timer is still pending after the call settled');
});
