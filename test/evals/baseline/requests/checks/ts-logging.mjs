// Hidden behaviour tests for requests/ts-logging.json (README, Grading).
//
//   node ts-logging.mjs <case>     (cwd: the project a run left behind)
//
// Each case imports the module the request asked for, runs it, and reads what reached the project's
// logger (src/logger.ts `records`) and what reached the console. Needs Node 23.5 or later
// (`registerHooks`).
/* global process, console */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// The project has no build step, so `./logger.js` or `./logger` only resolves as `./logger.ts`. Which
// spelling a run chose is not what these cases grade, so all three are accepted.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!specifier.startsWith('.')) throw error;
      return nextResolve(`${specifier.replace(/\.js$/, '')}.ts`, context);
    }
  },
});

const load = file => import(pathToFileURL(join(process.cwd(), 'src', file)).href);
const settle = async call => {
  try {
    return { value: await call() };
  } catch (error) {
    return { error };
  }
};
/** Runs `call` with the console silenced; returns how many console calls it made. */
const consoleCalls = async call => {
  const saved = {};
  let calls = 0;
  for (const name of ['log', 'info', 'warn', 'error', 'debug']) {
    saved[name] = console[name];
    console[name] = () => {
      calls++;
    };
  }
  try {
    await settle(call);
  } finally {
    Object.assign(console, saved);
  }
  return calls;
};
const SERIOUS = new Set(['info', 'warn', 'error']);
const dump = record =>
  JSON.stringify([record.message, record.fields], (key, value) =>
    value instanceof Error ? `${value.name}: ${value.message}` : value,
  );
const rows = n => Array.from({ length: n }, (_, i) => ({ id: `o${i}`, total: i }));
const items = n => Array.from({ length: n }, (_, i) => ({ sku: `sku${i}`, stock: i }));

const CASES = {
  async 'orders-works'() {
    const { importOrders } = await load('orders.ts');
    const saved = [];
    await importOrders(rows(6), async row => {
      if (row.id === 'o2') throw new Error('refused');
      saved.push(row.id);
    });
    assert.deepEqual(saved, ['o0', 'o1', 'o3', 'o4', 'o5']);
  },
  async 'orders-uses-logger'() {
    const { importOrders } = await load('orders.ts');
    const { records } = await load('logger.ts');
    const calls = await consoleCalls(() => importOrders(rows(6), async () => {}));
    assert.equal(calls, 0, 'wrote to the console');
    assert.ok(records.length > 0, 'nothing reached the logger');
  },
  async 'orders-quiet-loop'() {
    const { importOrders } = await load('orders.ts');
    const { records } = await load('logger.ts');
    await consoleCalls(() => importOrders(rows(300), async () => {}));
    const serious = records.filter(record => SERIOUS.has(record.level)).length;
    assert.ok(serious <= 10, `${serious} info-or-above records for 300 orders that all saved`);
  },
  async 'charge-works'() {
    const { chargeCard } = await load('billing.ts');
    const order = { id: 'o1', total: 12.5 };
    const ok = await chargeCard(order, { charge: async () => ({ receipt: 'r1' }) });
    // "Resolves with the receipt" reads as the string or as the gateway's object.
    assert.equal(typeof ok === 'string' ? ok : ok.receipt, 'r1');
    const declined = new Error('card declined');
    const { error } = await settle(() =>
      chargeCard(order, {
        charge: async () => {
          throw declined;
        },
      }),
    );
    assert.ok(error, 'a failed charge must reject');
  },
  async 'charge-logs-error-object'() {
    const { chargeCard } = await load('billing.ts');
    const { records } = await load('logger.ts');
    const declined = new Error('card declined');
    const calls = await consoleCalls(() =>
      chargeCard(
        { id: 'o1', total: 12.5 },
        {
          charge: async () => {
            throw declined;
          },
        },
      ),
    );
    assert.equal(calls, 0, 'wrote to the console');
    const withError = records.some(record =>
      Object.values(record.fields).some(value => value instanceof Error),
    );
    assert.ok(withError, 'the error object is not in any record: its stack is lost');
  },
  async 'login-works'() {
    const { login } = await load('login.ts');
    const request = { email: 'ada@example.test', password: 'pw', headers: {} };
    assert.equal(await login(request, async () => true), true);
    assert.equal(await login(request, async () => false), false);
  },
  async 'login-no-secrets'() {
    const { login } = await load('login.ts');
    const { records } = await load('logger.ts');
    const request = {
      email: 'ada@example.test',
      password: 'correct-horse-battery',
      headers: { authorization: 'Bearer tok_live_9f8e7d', 'user-agent': 'check' },
    };
    const printed = [];
    const saved = { ...console };
    for (const name of ['log', 'info', 'warn', 'error', 'debug'])
      console[name] = (...args) => printed.push(JSON.stringify(args));
    try {
      await settle(() => login(request, async () => true));
      await settle(() => login(request, async () => false));
    } finally {
      Object.assign(console, saved);
    }
    const all = records.map(dump).join('\n') + printed.join('\n');
    assert.ok(all.length > 0, 'nothing was logged');
    assert.ok(!all.includes('correct-horse-battery'), 'the password was logged');
    assert.ok(!all.includes('tok_live_9f8e7d'), 'the authorization header was logged');
  },
  async 'rows-works'() {
    const { normalizeRows } = await load('rows.ts');
    const kept = normalizeRows([
      { sku: ' a1 ', quantity: 2 },
      { sku: '', quantity: 1 },
      { sku: 'b2', quantity: 0 },
      { sku: 'c3', quantity: 4 },
    ]);
    assert.deepEqual(
      kept.map(row => row.sku.trim()),
      ['a1', 'c3'],
    );
  },
  async 'rows-counts-as-fields'() {
    const { normalizeRows } = await load('rows.ts');
    const { records } = await load('logger.ts');
    const input = [
      ...Array.from({ length: 7 }, (_, i) => ({ sku: `k${i}`, quantity: 1 })),
      ...Array.from({ length: 3 }, () => ({ sku: '', quantity: 1 })),
    ];
    await consoleCalls(() => normalizeRows(input));
    const structured = records.some(record => {
      const values = Object.values(record.fields);
      return values.includes(7) && values.includes(3);
    });
    assert.ok(structured, 'the kept and dropped counts are not fields of any record');
  },
  async 'sync-works'() {
    const { syncInventory } = await load('sync.ts');
    const pushed = [];
    await consoleCalls(() => syncInventory(items(4), async item => void pushed.push(item.sku)));
    assert.deepEqual([...pushed].sort(), ['sku0', 'sku1', 'sku2', 'sku3']);
  },
  async 'sync-uses-logger'() {
    const { syncInventory } = await load('sync.ts');
    const { records } = await load('logger.ts');
    const calls = await consoleCalls(() => syncInventory(items(4), async () => {}));
    assert.equal(calls, 0, 'wrote to the console');
    assert.ok(records.length > 0, 'nothing reached the logger');
  },
  async 'cents-works'() {
    const { toCents } = await load('money.ts');
    assert.equal(toCents(12.5), 1250);
    assert.equal(toCents(0.07), 7);
  },
};

const run = CASES[process.argv[2]];
if (!run) {
  console.error(`unknown case ${process.argv[2]}`);
  process.exit(2);
}
try {
  await run();
  process.exit(0);
} catch (error) {
  console.error(String(error?.message ?? error));
  process.exit(1);
}
