import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWebhook, WebhookError } from '../src/webhook.ts';

const valid = {
  id: 'evt_1',
  type: 'payment.succeeded',
  amountCents: 1250,
  metadata: { orderId: 'ord_9', plan: 'pro' },
};

const FIELDS = ['amountCents', 'id', 'metadata', 'type'];

// Compares own fields only: a metadata object without a prototype is a valid Record<string, string>.
const plain = (event: ReturnType<typeof parseWebhook>) => ({ ...event, metadata: { ...event.metadata } });

function rejects(body: string): void {
  assert.throws(() => parseWebhook(body), WebhookError, `accepted ${body}`);
}

function withBody(changes: Record<string, unknown>): string {
  return JSON.stringify({ ...valid, ...changes });
}

// Removes anything a test's input managed to put on Object.prototype, so one failure stays local.
function cleanPrototype(...keys: string[]): void {
  for (const key of keys) delete (Object.prototype as Record<string, unknown>)[key];
}

test('parses a payment.succeeded event', () => {
  assert.deepEqual(plain(parseWebhook(JSON.stringify(valid))), valid);
});

test('parses a payment.failed event with empty metadata', () => {
  const body = withBody({ type: 'payment.failed', amountCents: 0, metadata: {} });
  assert.deepEqual(plain(parseWebhook(body)), { ...valid, type: 'payment.failed', amountCents: 0, metadata: {} });
});

test('WebhookError is an Error', () => {
  assert.ok(new WebhookError('x') instanceof Error);
});

test('rejects a body that is not a JSON object', () => {
  for (const body of ['', '{', 'not json', 'null', '[]', '"evt_1"', '42', 'true']) rejects(body);
});

test('rejects missing fields', () => {
  for (const field of FIELDS) {
    const copy: Record<string, unknown> = { ...valid };
    delete copy[field];
    rejects(JSON.stringify(copy));
  }
});

test('rejects fields of the wrong type', () => {
  for (const changes of [
    { id: '' },
    { id: 7 },
    { id: null },
    { type: 'payment.refunded' },
    { type: 'PAYMENT.SUCCEEDED' },
    { amountCents: '1250' },
    { amountCents: 12.5 },
    { amountCents: -1 },
    { amountCents: null },
    { metadata: 'plan=pro' },
    { metadata: ['pro'] },
    { metadata: null },
    { metadata: { retries: 3 } },
  ])
    rejects(withBody(changes));
});

test('rejects extra nesting', () => {
  rejects(JSON.stringify({ event: valid }));
  rejects(JSON.stringify([valid]));
  rejects(withBody({ id: { value: 'evt_1' } }));
  rejects(withBody({ amountCents: [1250] }));
  rejects(withBody({ metadata: { plan: { tier: 'pro' } } }));
});

test('the event holds only the four fields', () => {
  let event;
  try {
    event = parseWebhook(withBody({ debug: true, internalNote: 'x' }));
  } catch (error) {
    assert.ok(error instanceof WebhookError, 'an unknown field may be rejected, with WebhookError');
    return;
  }
  assert.deepEqual(Object.keys(event).sort(), FIELDS);
});

test('a top-level __proto__ key does not leak into the event', () => {
  const body = `{"id":"evt_1","type":"payment.succeeded","amountCents":1250,"metadata":{},"__proto__":{"isAdmin":true}}`;
  try {
    let event;
    try {
      event = parseWebhook(body);
    } catch (error) {
      assert.ok(error instanceof WebhookError, 'the body may be rejected, with WebhookError');
      return;
    }
    assert.equal(Object.getPrototypeOf(event), Object.prototype);
    assert.ok(!Object.hasOwn(event, '__proto__'), 'the event has an own __proto__ key');
    assert.equal((event as Record<string, unknown>).isAdmin, undefined);
    assert.deepEqual(Object.keys(event).sort(), FIELDS);
  } finally {
    assert.equal(({} as Record<string, unknown>).isAdmin, undefined, 'Object.prototype was polluted');
    cleanPrototype('isAdmin');
  }
});

test('a __proto__ key inside metadata is rejected and pollutes nothing', () => {
  const body = `{"id":"evt_1","type":"payment.succeeded","amountCents":1250,"metadata":{"__proto__":{"polluted":"yes"}}}`;
  try {
    rejects(body);
  } finally {
    assert.equal(({} as Record<string, unknown>).polluted, undefined, 'Object.prototype was polluted');
    cleanPrototype('polluted');
  }
});
