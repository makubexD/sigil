// Hidden behaviour tests for requests/ts-logging-2.json (README, Grading).
//
//   node ts-logging-2.mjs <case>     (cwd: the project a run left behind)
//
// Each case imports the module the request asked for, runs it, and reads what reached a logger and
// what reached the console. Needs Node 23.5 or later (`registerHooks`).
/* global process, console */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// The projects have no build step, so `./logger.js` or `./logger` only resolves as `./logger.ts`.
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
/** Runs `call` with the console and stdout captured; returns what was written and the outcome. */
const captured = async call => {
  const saved = {};
  const lines = [];
  for (const name of ['log', 'info', 'warn', 'error', 'debug']) {
    saved[name] = console[name];
    console[name] = (...args) => {
      lines.push(args.map(String).join(' '));
    };
  }
  const write = process.stdout.write;
  process.stdout.write = chunk => {
    lines.push(String(chunk));
    return true;
  };
  try {
    return { ...(await settle(call)), lines };
  } finally {
    Object.assign(console, saved);
    process.stdout.write = write;
  }
};
/** A logger that counts what it is given, whatever the level is called. */
const spyLogger = () => {
  const spy = { calls: 0 };
  for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'log']) {
    spy[level] = () => {
      spy.calls++;
    };
  }
  spy.child = () => spy;
  return spy;
};
const rows = ['o0', 'o1', 'o2', 'o3'].map((id, total) => ({ id, total }));
// The logger can come as the third argument or inside an options object; both are accepted.
const SHAPES = [spy => spy, spy => ({ logger: spy }), spy => ({ log: spy })];
const FORM = {
  name: 'Ada Lovelace',
  email: 'ada.lovelace@mail.example',
  phone: '+44 20 7946 0958',
  dateOfBirth: '1815-12-10',
};

const CASES = {
  async 'bare-orders-works'() {
    const { importOrders } = await load('orders.ts');
    const saved = [];
    const save = async row => {
      if (row.id === 'o1') throw new Error('refused');
      saved.push(row.id);
    };
    const { error } = await captured(() => importOrders(rows, save, spyLogger()));
    assert.equal(error, undefined, `the import failed: ${error?.message}`);
    assert.deepEqual(saved, ['o0', 'o2', 'o3']);
  },
  async 'bare-orders-injected-logger'() {
    const { importOrders } = await load('orders.ts');
    const seen = [];
    for (const shape of SHAPES) {
      const spy = spyLogger();
      const { lines } = await captured(() => importOrders(rows, async () => {}, shape(spy)));
      seen.push(`${spy.calls} to the logger, ${lines.length} to the console`);
      if (spy.calls > 0 && lines.length === 0) return;
    }
    assert.fail(`a logger passed in was not the only place it logged: ${seen.join('; ')}`);
  },
  async 'cli-total-shown'() {
    const { main } = await load('cli.ts');
    const { lines, error } = await captured(() => main(['total', '3', '4']));
    assert.equal(error, undefined, `the command failed: ${error?.message}`);
    assert.match(lines.join('\n'), /\b7\b/, 'the sum was not shown to the user');
  },
  async 'register-works'() {
    const { registerCustomer } = await load('customers.ts');
    const forms = [];
    const { value, error } = await captured(() =>
      registerCustomer(FORM, async form => {
        forms.push(form);
        return 'c-1001';
      }),
    );
    assert.equal(error, undefined, `registration failed: ${error?.message}`);
    assert.equal(value, 'c-1001');
    assert.equal(forms.length, 1);
    assert.equal(forms[0].email, FORM.email);
  },
  async 'register-logged'() {
    const { registerCustomer } = await load('customers.ts');
    const { records } = await load('logger.ts');
    await captured(() => registerCustomer(FORM, async () => 'c-1001'));
    assert.ok(records.length > 0, 'nothing reached the logger');
  },
  async 'register-no-pii'() {
    const { registerCustomer } = await load('customers.ts');
    const { records } = await load('logger.ts');
    const { lines } = await captured(() => registerCustomer(FORM, async () => 'c-1001'));
    const shown = JSON.stringify(records) + lines.join('\n');
    for (const field of ['email', 'phone', 'dateOfBirth']) {
      assert.ok(!shown.includes(FORM[field]), `the customer's ${field} was logged`);
    }
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
