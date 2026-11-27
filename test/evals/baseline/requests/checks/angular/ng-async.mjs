// Hidden behaviour tests for requests/ng-async.json (README, Grading).
import assert from 'node:assert/strict';
import {
  TestBed, app, calls, load, method, mount, pick, route, rx, settle, sleep, sources, textOf,
  unhandled, waitFor,
} from '../web/ng-kit.mjs'; // prettier-ignore

const FAILURE = /fail|error|couldn.t|could not|unable|try again|went wrong|problem|unavailable/i;
const read = value => (typeof value === 'function' ? value() : value);

async function profile(status) {
  route('GET', '/api/profile', () =>
    status === 200
      ? { body: { id: 'u1', name: 'Ada Lovelace' }, delay: 10 }
      : { status, delay: 10 },
  );
  await app();
  const fixture = await mount(pick(await load('profile.component.ts'), 'ProfileComponent'));
  await settle(fixture, 150);
  return fixture;
}

function productsApi() {
  route('GET', /^\/api\/products\?q=/, call => {
    const term = decodeURIComponent(call.path.split('q=')[1]);
    return { body: [{ sku: `${term}-1`, title: term }], delay: term.length === 1 ? 200 : 20 };
  });
}
async function store() {
  productsApi();
  await app();
  const instance = TestBed.inject(pick(await load('search.store.ts'), 'SearchStore'));
  return {
    instance,
    search: method(instance, 'search'),
    first: () => read(instance.results)?.[0]?.sku,
  };
}

async function badge() {
  const listeners = new Set();
  const { NoticesService } = await load('notices.service.ts');
  const fake = {
    stream: () =>
      new rx.Observable(subscriber => {
        listeners.add(subscriber);
        return () => listeners.delete(subscriber);
      }),
  };
  await app([{ provide: NoticesService, useValue: fake }]);
  const fixture = await mount(
    pick(await load('notices-badge.component.ts'), 'NoticesBadgeComponent'),
  );
  return { fixture, listeners };
}

export const CASES = {
  async 'profile-works'() {
    const fixture = await profile(200);
    await waitFor(() => textOf(fixture).includes('Ada Lovelace'), 'the name never showed', {
      fixture,
    });
  },
  async 'profile-failure-handled'() {
    await profile(500);
    await sleep(150);
    assert.equal(unhandled.length, 0, 'a refused load ends in a promise rejection nothing handles');
  },
  async 'profile-failure-shown'() {
    const fixture = await profile(500);
    await waitFor(
      () => fixture.nativeElement.querySelector('[role=alert]') || FAILURE.test(textOf(fixture)),
      'a refused load shows the user nothing',
      { fixture },
    );
  },
  async 'cart-total-works'() {
    route('GET', '/api/cart', () => ({
      body: [
        { sku: 'a', price: 10, quantity: 2 },
        { sku: 'b', price: 5, quantity: 1 },
      ],
      delay: 10,
    }));
    await app();
    const service = TestBed.inject(pick(await load('cart.service.ts'), 'CartService'));
    const total = method(service, 'total')();
    assert.equal(typeof total?.then, 'function', 'total() does not return a promise');
    assert.equal(await total, 25);
  },
  async 'cart-no-to-promise'() {
    for (const { name, text } of sources())
      assert.doesNotMatch(text, /\.toPromise\s*\(/, `${name} uses the deprecated toPromise()`);
  },
  async 'search-works'() {
    const { search, first } = await store();
    search('lamp');
    await waitFor(() => first() === 'lamp-1', 'no results arrived');
  },
  async 'search-latest-wins'() {
    const { search, first } = await store();
    search('l');
    await sleep(30);
    search('la');
    await waitFor(() => first() === 'la-1', 'no results for the new term');
    await sleep(400);
    assert.equal(
      first(),
      'la-1',
      'the slower answer for the previous term replaced the current one',
    );
  },
  async 'search-cancels-stale'() {
    const { search, first } = await store();
    search('l');
    await sleep(30);
    search('la');
    await waitFor(() => first() === 'la-1', 'no results for the new term');
    const stale = calls.filter(call => call.path.endsWith('q=l'));
    assert.ok(
      stale.every(call => call.signal?.aborted),
      'the request for the previous term was left running',
    );
  },
  async 'badge-works'() {
    const { fixture, listeners } = await badge();
    assert.ok(listeners.size > 0, 'the badge never listens for notices');
    for (const subscriber of listeners) {
      subscriber.next({ id: 'n1', text: 'one' });
      subscriber.next({ id: 'n2', text: 'two' });
    }
    await waitFor(
      () => /\b2\b/.test(textOf(fixture)),
      'two notices arrived and the badge does not say 2',
      { fixture },
    );
  },
  async 'badge-stops-listening'() {
    const { fixture, listeners } = await badge();
    assert.ok(listeners.size > 0, 'the badge never listens for notices');
    fixture.destroy();
    await sleep(20);
    assert.equal(listeners.size, 0, 'the badge still listens after it is removed from the page');
  },
  async 'import-works'() {
    const { importRows } = await load('import.ts');
    assert.deepEqual(importRows(['a,1', 'b,2.5']), [
      { sku: 'a', price: 1 },
      { sku: 'b', price: 2.5 },
    ]);
  },
  async 'import-error-names-line'() {
    const { importRows } = await load('import.ts');
    const { ImportError } = await load('csv.ts');
    assert.throws(
      () => importRows(['a,1', 'b,x', 'c,3']),
      error => error instanceof ImportError && /\b2\b/.test(error.message),
      'a bad second line does not throw an ImportError that names line 2',
    );
  },
  async 'import-error-keeps-cause'() {
    const { importRows } = await load('import.ts');
    let thrown;
    try {
      importRows(['a,1', 'b,x']);
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown, 'a bad line did not throw');
    assert.ok(
      thrown.cause instanceof SyntaxError,
      'the error that says what is wrong with the line is lost',
    );
  },
  async 'initials-works'() {
    const { initials } = await load('initials.ts');
    assert.equal(initials('Ada Lovelace'), 'AL');
  },
};
