import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendWithRetry } from '../src/retry.ts';

type Outcome = { status: number } | Error;

/** A fake send() that plays `outcomes` in order (the last one repeats) and counts calls. */
function fakeSend(...outcomes: Outcome[]): { send: () => Promise<{ status: number }>; calls: () => number } {
  let calls = 0;
  return {
    send: async () => {
      const outcome = outcomes[Math.min(calls, outcomes.length - 1)];
      calls++;
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
    calls: () => calls,
  };
}

/** A delay that records the requested waits and returns at once. */
function fakeDelay(): { delay: (ms: number) => Promise<void>; waits: number[] } {
  const waits: number[] = [];
  return { delay: async ms => void waits.push(ms), waits };
}

test('returns the first successful response', async () => {
  const ok = { status: 200 };
  const { send, calls } = fakeSend(ok);
  const { delay, waits } = fakeDelay();
  assert.equal(await sendWithRetry(send, { delay }), ok);
  assert.equal(calls(), 1);
  assert.deepEqual(waits, []);
});

test('retries a 503 and then succeeds', async () => {
  const ok = { status: 201 };
  const { send, calls } = fakeSend({ status: 503 }, ok);
  const { delay, waits } = fakeDelay();
  assert.equal(await sendWithRetry(send, { delay }), ok);
  assert.equal(calls(), 2);
  assert.deepEqual(waits, [100]);
});

test('retries network errors with exponential backoff', async () => {
  const ok = { status: 200 };
  const { send, calls } = fakeSend(new Error('ECONNRESET'), new Error('ETIMEDOUT'), new Error('ECONNRESET'), ok);
  const { delay, waits } = fakeDelay();
  assert.equal(await sendWithRetry(send, { baseDelayMs: 10, delay }), ok);
  assert.equal(calls(), 4);
  assert.deepEqual(waits, [10, 20, 40]);
});

test('gives up after the configured retries with the last failure as cause', async () => {
  const last = { status: 503 };
  const { send, calls } = fakeSend({ status: 500 }, new Error('ECONNRESET'), last);
  const { delay } = fakeDelay();
  await assert.rejects(sendWithRetry(send, { retries: 2, delay }), (error: Error) => {
    assert.ok(error instanceof Error);
    assert.equal(error.cause, last);
    return true;
  });
  assert.equal(calls(), 3);

  const networkError = new Error('ECONNREFUSED');
  const failing = fakeSend(networkError);
  await assert.rejects(sendWithRetry(failing.send, { delay }), (error: Error) => {
    assert.equal(error.cause, networkError);
    return true;
  });
  assert.equal(failing.calls(), 4, 'default retries is 3');
});

test('does not retry a 400, 404 or 422', async () => {
  for (const status of [400, 404, 422]) {
    const response = { status };
    const { send, calls } = fakeSend(response, { status: 200 });
    const { delay, waits } = fakeDelay();
    await assert.rejects(sendWithRetry(send, { delay }), (error: Error) => {
      assert.ok(error instanceof Error);
      assert.equal(error.cause, response);
      return true;
    });
    assert.equal(calls(), 1, `${status} was sent ${calls()} times`);
    assert.deepEqual(waits, []);
  }
});
