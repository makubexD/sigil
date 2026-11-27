// Hidden behaviour tests for requests/ts-async-2.json (README, Grading).
//
//   node ts-async-2.mjs <case>     (cwd: the project a run left behind)
//
// Each case imports the module the request asked for and exits 0 when the behaviour holds.
/* global process, console, setTimeout, setInterval, clearInterval, AbortController, AbortSignal */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const load = file => import(pathToFileURL(join(process.cwd(), 'src', file)).href);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const settle = promise =>
  Promise.resolve(promise).then(
    value => ({ value }),
    error => ({ error }),
  );
/** What `promise` settled with, or `undefined` when it has not settled after `ms`. */
const within = (promise, ms) => Promise.race([settle(promise), sleep(ms).then(() => undefined)]);
const page = number => [{ sku: `p${number}` }];
const hash = (data, rounds) => {
  let value = data;
  for (let i = 0; i < rounds; i++) value = createHash('sha256').update(value).digest('hex');
  return value;
};

const CASES = {
  async 'catalog-works'() {
    const { syncCatalog } = await load('catalog.ts');
    const items = await syncCatalog(3, async number => page(number));
    assert.deepEqual(
      items.map(item => item.sku),
      ['p1', 'p2', 'p3'],
    );
  },
  async 'catalog-passes-signal'() {
    const { syncCatalog } = await load('catalog.ts');
    const controller = new AbortController();
    const seen = [];
    await syncCatalog(
      2,
      async (number, signal) => {
        seen.push(signal);
        return page(number);
      },
      controller.signal,
    );
    assert.equal(seen.length, 2);
    assert.ok(
      seen.every(signal => signal instanceof AbortSignal),
      'fetchPage was called without a signal',
    );
    controller.abort();
    assert.ok(
      seen.every(signal => signal.aborted),
      "the signal fetchPage got does not follow the caller's",
    );
  },
  async 'catalog-stops'() {
    const { syncCatalog } = await load('catalog.ts');
    const controller = new AbortController();
    let calls = 0;
    // A fetchPage that ignores its signal, so only the loop can stop the sync.
    const run = syncCatalog(
      50,
      async number => {
        calls++;
        await sleep(20);
        return page(number);
      },
      controller.signal,
    );
    setTimeout(() => controller.abort(), 50);
    const outcome = await within(run, 2000);
    assert.ok(outcome, 'the sync did not settle after the caller cancelled');
    assert.ok(calls <= 6, `${calls} of 50 pages were fetched after the caller cancelled at page 3`);
  },
  async 'dashboard-works'() {
    const { loadDashboard } = await load('dashboard.ts');
    const dashboard = await loadDashboard('u1', {
      profile: async id => ({ id, name: 'Ada' }),
      orders: async () => ['o1'],
      recommendations: async () => ['r1', 'r2'],
    });
    assert.deepEqual(dashboard, {
      profile: { id: 'u1', name: 'Ada' },
      orders: ['o1'],
      recommendations: ['r1', 'r2'],
    });
  },
  async 'dashboard-together'() {
    const { loadDashboard } = await load('dashboard.ts');
    const slow = value => async () => {
      await sleep(150);
      return value;
    };
    const start = Date.now();
    await loadDashboard('u1', {
      profile: slow({ id: 'u1', name: 'Ada' }),
      orders: slow([]),
      recommendations: slow([]),
    });
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 380, `three 150 ms calls took ${elapsed} ms`);
  },
  async 'dashboard-cancels-rest'() {
    const { loadDashboard } = await load('dashboard.ts');
    const signals = {};
    const slow = (name, value) => async (id, signal) => {
      signals[name] = signal;
      await sleep(300);
      return value;
    };
    const run = settle(
      loadDashboard('u1', {
        profile: slow('profile', { id: 'u1', name: 'Ada' }),
        orders: async () => {
          await sleep(20);
          throw new Error('orders service is down');
        },
        recommendations: slow('recommendations', []),
      }),
    );
    await sleep(150);
    for (const name of ['profile', 'recommendations']) {
      assert.ok(signals[name] instanceof AbortSignal, `${name} was called without a signal`);
      assert.ok(signals[name].aborted, `${name} was left running after orders failed`);
    }
    const outcome = await run;
    assert.ok(outcome.error, 'the failure did not reach the caller');
  },
  async 'caches-works'() {
    const { warmCaches } = await load('caches.ts');
    const warmed = [];
    await warmCaches(['a', 'b', 'c'], async key => {
      warmed.push(key);
    });
    assert.deepEqual(warmed.sort(), ['a', 'b', 'c']);
  },
  async 'caches-failure-surfaces'() {
    const { warmCaches } = await load('caches.ts');
    const outcome = await within(
      warmCaches(['a', 'b', 'c'], async key => {
        await sleep(5);
        if (key === 'b') throw new Error('origin unreachable');
      }),
      2000,
    );
    assert.ok(outcome?.error, 'a key that could not be warmed was reported as warmed');
  },
  async 'ready-works'() {
    const { waitForReady } = await load('ready.ts');
    let calls = 0;
    const outcome = await within(
      waitForReady(async () => ++calls >= 3, 10, 2000),
      3000,
    );
    assert.ok(
      outcome && !outcome.error,
      `not ready: ${outcome?.error?.message ?? 'never settled'}`,
    );
    assert.ok(calls >= 3);
  },
  async 'ready-times-out'() {
    const { waitForReady } = await load('ready.ts');
    const outcome = await within(
      waitForReady(async () => false, 10, 100),
      1500,
    );
    assert.ok(outcome?.error, 'no rejection after the timeout');
  },
  async 'ready-check-failure-settles'() {
    const { waitForReady } = await load('ready.ts');
    let unhandled = false;
    process.on('unhandledRejection', () => {
      unhandled = true;
    });
    const outcome = await within(
      waitForReady(
        async () => {
          throw new Error('unknown host');
        },
        10,
        200,
      ),
      1500,
    );
    await sleep(50);
    assert.equal(unhandled, false, 'a failed check was an unhandled rejection');
    assert.ok(outcome?.error, 'a failed check left the caller waiting');
  },
  async 'fingerprint-works'() {
    const { fingerprint } = await load('fingerprint.ts');
    assert.equal(await fingerprint('upload-1', 3), hash('upload-1', 3));
    assert.equal(await fingerprint('upload-1', 1000), hash('upload-1', 1000));
  },
  async 'fingerprint-loop-free'() {
    const { fingerprint } = await load('fingerprint.ts');
    const ROUNDS = 400_000;
    const expected = hash('upload-2', ROUNDS);
    await sleep(20);
    let last = Date.now();
    let worst = 0;
    const ticker = setInterval(() => {
      const now = Date.now();
      worst = Math.max(worst, now - last);
      last = now;
    }, 10);
    const outcome = await within(fingerprint('upload-2', ROUNDS), 60_000);
    worst = Math.max(worst, Date.now() - last);
    clearInterval(ticker);
    assert.ok(
      outcome && !outcome.error,
      `no result: ${outcome?.error?.message ?? 'never settled'}`,
    );
    assert.equal(outcome.value, expected);
    assert.ok(worst < 150, `the event loop stood still for ${worst} ms`);
  },
  async 'initials-works'() {
    const { initials } = await load('names.ts');
    assert.equal(initials('ada lovelace'), 'AL');
  },
};

const name = process.argv[2];
if (!Object.hasOwn(CASES, name)) {
  console.error(`unknown case: ${name}`);
  process.exit(2);
}
try {
  await CASES[name]();
  process.exit(0);
} catch (error) {
  console.error(`${name}: ${error.message}`);
  process.exit(1);
}
