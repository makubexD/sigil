// Hidden behaviour tests for requests/ng-security.json (README, Grading).
/* global window, document, localStorage, sessionStorage, URL */
import assert from 'node:assert/strict';
import {
  TestBed,
  app,
  calls,
  load,
  method,
  mount,
  pick,
  route,
  rx,
  sleep,
  textOf,
  waitFor,
} from '../web/ng-kit.mjs';

const SESSION = {
  user: { id: 'u1', name: 'Ada' },
  accessToken: 'at-4be1c07d9a',
  refreshToken: 'rt-93fd02ab6e',
};

async function announcement(html) {
  route('GET', '/api/announcement', () => ({ body: { html }, delay: 10 }));
  await app();
  const Component = pick(await load('announcement.component.ts'), 'AnnouncementComponent');
  const fixture = await mount(Component);
  await waitFor(() => textOf(fixture).includes('Sale'), 'the announcement never showed', {
    fixture,
  });
  return fixture.nativeElement;
}
const VIDEO = '<iframe src="https://videos.example.com/embed/42"></iframe>';

async function orderSearch(customer, page) {
  route('GET', /^\/api\/orders\?/, () => ({ body: [{ id: 'o1', customer: 'x', total: 1 }] }));
  await app();
  const service = TestBed.inject(pick(await load('orders.service.ts'), 'OrdersService'));
  const found = await rx.firstValueFrom(rx.from(method(service, 'search')(customer, page)));
  assert.equal(found?.[0]?.id, 'o1', 'the search returned nothing');
  const call = calls.find(candidate => candidate.path.startsWith('/api/orders?'));
  return new URL(call.url).searchParams;
}

function sessionApi() {
  let signedIn = false;
  route('POST', '/api/session', () => {
    signedIn = true;
    return { body: SESSION, delay: 10 };
  });
  route('DELETE', '/api/session', () => {
    signedIn = false;
    return { body: {} };
  });
  route('GET', '/api/me', () => (signedIn ? { body: SESSION.user, delay: 10 } : { status: 401 }));
}
async function session() {
  await app();
  const service = TestBed.inject(pick(await load('session.service.ts'), 'SessionService'));
  await sleep(60);
  return service;
}
const userOf = service => (typeof service.user === 'function' ? service.user() : service.user);
async function signedIn() {
  sessionApi();
  const service = await session();
  await rx.firstValueFrom(
    rx.from(method(service, 'signIn')('ada@office.example', 'correct horse')),
    {
      defaultValue: undefined,
    },
  );
  await waitFor(() => userOf(service)?.name === 'Ada', 'signing in did not set the user');
  return service;
}

async function download() {
  route('GET', /^\/api\/reports\/r1/, () => ({ body: 'pdf-bytes', delay: 10 }));
  const opened = [];
  window.open = (url = '') => (opened.push(String(url)), null);
  const assign = [];
  const click = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function () {
    assign.push(this.href);
    return click.call(this);
  };
  await app();
  const auth = TestBed.inject(pick(await load('auth.service.ts'), 'AuthService'));
  auth.token.set(SESSION.accessToken);
  const service = TestBed.inject(pick(await load('reports.service.ts'), 'ReportsService'));
  const result = method(service, 'download')('r1');
  if (result && (typeof result.subscribe === 'function' || typeof result.then === 'function'))
    await rx.firstValueFrom(rx.from(result), { defaultValue: undefined });
  await sleep(100);
  return { urls: [...opened, ...assign, ...calls.map(call => call.url)], opened, assign };
}

export const CASES = {
  async 'announcement-works'() {
    const page = await announcement(
      '<p>Sale <b>today</b>, <a href="https://shop.example/sale">details</a></p>',
    );
    assert.equal(
      page.querySelector('b, strong')?.textContent,
      'today',
      'the bold text is not bold',
    );
    assert.ok(page.querySelector('a[href="https://shop.example/sale"]'), 'the link is not a link');
  },
  async 'announcement-video'() {
    const page = await announcement(`<p>Sale <b>today</b></p>${VIDEO}`);
    const frame = page.querySelector('iframe');
    assert.ok(frame, 'the video is not on the page');
    assert.equal(new URL(frame.src).host, 'videos.example.com');
  },
  async 'announcement-safe'() {
    const page = await announcement(
      `<p>Sale <b>today</b></p>${VIDEO}<img src="x" onerror="window.pwned = 1"><script>window.pwned = 1</script>` +
        '<a href="javascript:window.pwned = 1">win</a><iframe src="https://evil.example/steal"></iframe>' +
        '<iframe src="javascript:window.pwned = 1"></iframe>',
    );
    assert.equal(page.querySelector('script'), null, 'a script element reached the page');
    for (const element of page.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        assert.ok(!/^on/i.test(attribute.name), `an ${attribute.name} handler reached the page`);
        assert.ok(
          !/^\s*javascript:/i.test(attribute.value),
          'a javascript: address reached the page',
        );
      }
    }
    for (const frame of page.querySelectorAll('iframe'))
      assert.equal(
        new URL(frame.src, 'https://x.invalid').host,
        'videos.example.com',
        `a frame from ${frame.src} reached the page`,
      );
  },
  async 'orders-search-works'() {
    const params = await orderSearch('Acme', 2);
    assert.equal(params.get('customer'), 'Acme');
    assert.equal(params.get('page'), '2');
  },
  async 'orders-search-encodes'() {
    const params = await orderSearch('Ben & Jerry=1&page=99#x', 2);
    assert.equal(
      params.get('customer'),
      'Ben & Jerry=1&page=99#x',
      'the customer name changed on its way into the URL',
    );
    assert.deepEqual(
      params.getAll('page'),
      ['2'],
      'the customer name added a parameter of its own',
    );
  },
  async 'invite-works'() {
    await app();
    const service = TestBed.inject(pick(await load('invites.service.ts'), 'InvitesService'));
    const newCode = method(service, 'newCode');
    const codes = new Set(Array.from({ length: 50 }, () => String(newCode())));
    assert.equal(codes.size, 50, 'two of fifty codes were the same');
    assert.ok(
      [...codes].every(code => code.length >= 8),
      'a code is shorter than 8 characters',
    );
  },
  async 'invite-unguessable'() {
    await app();
    const service = TestBed.inject(pick(await load('invites.service.ts'), 'InvitesService'));
    const newCode = method(service, 'newCode');
    // Whoever can predict Math.random can predict a code that is built from it.
    const random = Math.random;
    const now = Date.now;
    Math.random = () => 0.4242;
    Date.now = () => 1_700_000_000_000;
    try {
      assert.notEqual(String(newCode()), String(newCode()), 'the code comes from Math.random');
    } finally {
      Math.random = random;
      Date.now = now;
    }
  },
  async 'session-works'() {
    await signedIn();
  },
  async 'session-survives-reload'() {
    await signedIn();
    // A reload: a new application, with the browser's storage and the cookie session as they were.
    const service = await session();
    await waitFor(() => userOf(service)?.name === 'Ada', 'after a reload nobody is signed in');
  },
  async 'session-no-token-in-storage'() {
    await signedIn();
    await sleep(100);
    const dump = store =>
      Object.keys(store)
        .map(key => `${key}=${store.getItem(key)}`)
        .join('\n');
    const kept = `${dump(localStorage)}\n${dump(sessionStorage)}\n${document.cookie}`;
    assert.ok(
      !kept.includes(SESSION.accessToken),
      'the access token is in storage any script can read',
    );
    assert.ok(
      !kept.includes(SESSION.refreshToken),
      'the refresh token is in storage any script can read',
    );
  },
  async 'report-works'() {
    const { opened, assign } = await download();
    const fetched = calls.some(call => call.path.startsWith('/api/reports/r1'));
    assert.ok(fetched || opened.length + assign.length > 0, 'nothing asked for the report');
  },
  async 'report-token-not-in-url'() {
    const { urls } = await download();
    assert.ok(urls.length > 0, 'nothing asked for the report');
    for (const url of urls)
      assert.ok(
        !decodeURIComponent(url).includes(SESSION.accessToken),
        `the access token is in an address: ${url.slice(0, 80)}`,
      );
  },
  async 'initials-works'() {
    const { initials } = await load('initials.ts');
    assert.equal(initials('Ada Lovelace'), 'AL');
  },
};
