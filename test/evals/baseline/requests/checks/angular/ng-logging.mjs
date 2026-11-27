// Hidden behaviour tests for requests/ng-logging.json (README, Grading).
import assert from 'node:assert/strict';
import {
  TestBed, app, beacons, consoleCalls, core, everythingLogged, load, method, mount, pick, sleep, textOf,
  waitFor,
} from '../web/ng-kit.mjs'; // prettier-ignore

const logs = () =>
  beacons.filter(beacon => beacon.url === '/logs').map(beacon => JSON.parse(beacon.body));

async function orders() {
  const saved = [];
  const { OrdersApi } = await load('orders-api.service.ts');
  const fake = {
    save: async row => {
      if (row.id.startsWith('bad')) throw new Error(`the warehouse refused ${row.id}`);
      saved.push(row.id);
    },
  };
  await app([{ provide: OrdersApi, useValue: fake }]);
  const service = TestBed.inject(
    pick(await load('orders-import.service.ts'), 'OrdersImportService'),
  );
  const rows = ['a', 'bad-1', 'b', 'c', 'bad-2', 'd'].map(id => ({ id, total: 10 }));
  await method(service, 'import', 'importOrders', 'importRows')(rows);
  await sleep(50);
  return saved;
}

async function billing(fails) {
  const { GatewayService } = await load('gateway.service.ts');
  const declined = new Error('card declined');
  declined.stack = 'Error: card declined\n    at gateway-frame-91 (gateway.js:7:3)';
  const fake = {
    charge: async order => {
      if (fails) throw declined;
      return { id: `receipt-${order.id}` };
    },
  };
  await app([{ provide: GatewayService, useValue: fake }]);
  const service = TestBed.inject(pick(await load('billing.service.ts'), 'BillingService'));
  return { charge: method(service, 'charge'), declined };
}

const PASSWORD = 'correct horse battery';
const TOKEN = 'tok-71c9e2ab40';
async function login(password) {
  const { CredentialsService } = await load('credentials.service.ts');
  const fake = { check: async request => (request.password === PASSWORD ? TOKEN : null) };
  await app([{ provide: CredentialsService, useValue: fake }]);
  const service = TestBed.inject(pick(await load('login.service.ts'), 'LoginService'));
  const accepted = await method(service, 'login')({ email: 'ada@office.example', password });
  await sleep(50);
  return accepted;
}

async function cleaner() {
  await app();
  const service = TestBed.inject(pick(await load('row-cleaner.service.ts'), 'RowCleanerService'));
  const rows = [
    { sku: 'a', price: 1 },
    { sku: '', price: 2 },
    { sku: 'c', price: 3 },
    { sku: 'd', price: null },
    { sku: 'e', price: 5 },
  ];
  const kept = method(service, 'clean')(rows);
  await sleep(30);
  return kept;
}

async function prices() {
  await app();
  const service = TestBed.inject(pick(await load('prices.service.ts'), 'PricesService'));
  service.prices.set([
    { label: 'Setup', amount: 10.5 },
    { label: 'Hosting', amount: 20.25 },
  ]);
  const fixture = await mount(pick(await load('price-list.component.ts'), 'PriceListComponent'));
  return fixture;
}

export const CASES = {
  async 'orders-works'() {
    assert.deepEqual(
      await orders(),
      ['a', 'b', 'c', 'd'],
      'a refused row stopped the rows after it',
    );
  },
  async 'orders-uses-logger'() {
    await orders();
    assert.ok(logs().length > 0, 'nothing went through the logger');
  },
  async 'orders-no-console'() {
    await orders();
    assert.equal(consoleCalls.length, 0, `${consoleCalls.length} lines went to the console`);
  },
  async 'charge-works'() {
    const { charge } = await billing(false);
    assert.deepEqual(await charge({ id: 'o1', total: 10 }), { id: 'receipt-o1' });
  },
  async 'charge-rethrows'() {
    const { charge } = await billing(true);
    await assert.rejects(charge({ id: 'o1', total: 10 }), 'a declined charge did not reject');
  },
  async 'charge-logs-error-object'() {
    const { charge } = await billing(true);
    await charge({ id: 'o1', total: 10 }).catch(() => {});
    await sleep(30);
    assert.ok(logs().length > 0, 'a declined charge was not logged through the logger');
    assert.ok(
      beacons.some(beacon => beacon.body.includes('gateway-frame-91')),
      'the log has the message of the error and not the error: its stack is gone',
    );
  },
  async 'login-works'() {
    assert.equal(await login(PASSWORD), true);
    assert.equal(await login('wrong'), false);
  },
  async 'login-logs'() {
    await login(PASSWORD);
    assert.ok(logs().length > 0, 'an attempt was not logged through the logger');
  },
  async 'login-no-secrets'() {
    await login(PASSWORD);
    const logged = everythingLogged();
    assert.ok(!logged.includes(PASSWORD), 'the password is in the logs');
    assert.ok(!logged.includes(TOKEN), 'the access token is in the logs');
  },
  async 'rows-works'() {
    assert.deepEqual(
      (await cleaner()).map(row => row.sku),
      ['a', 'c', 'e'],
    );
  },
  async 'rows-counts-structured'() {
    await cleaner();
    const numbers = logs().flatMap(record => Object.values(record.context ?? {}));
    assert.ok(
      numbers.includes(3) && numbers.includes(2),
      'the counts of kept and dropped rows are not fields of the log record',
    );
  },
  async 'prices-works'() {
    const fixture = await prices();
    await waitFor(
      () =>
        /Setup/.test(textOf(fixture)) &&
        /Hosting/.test(textOf(fixture)) &&
        /30\.75/.test(textOf(fixture)),
      'the rows and the total 30.75 are not on the page',
      { fixture },
    );
  },
  async 'prices-log-not-per-check'() {
    const fixture = await prices();
    await sleep(30);
    // Ten re-checks with nothing changed, as when the user clicks around the component.
    for (let i = 0; i < 10; i++) {
      fixture.componentRef.injector.get(core.ChangeDetectorRef).markForCheck();
      fixture.detectChanges();
    }
    await sleep(30);
    const written = logs().length + consoleCalls.length;
    assert.ok(written <= 2, `ten checks of an unchanged list logged ${written} times`);
  },
  async 'initials-works'() {
    const { initials } = await load('initials.ts');
    assert.equal(initials('Ada Lovelace'), 'AL');
  },
};
