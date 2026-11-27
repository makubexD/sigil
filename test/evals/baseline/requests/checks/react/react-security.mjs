// Hidden behaviour tests for requests/react-security.json (README, Grading).
/* global window, document, localStorage, sessionStorage, process, URL */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  act, button, calls, click, dom, exists, h, load, navigations, pick, queryClient, render, route,
  type, wait, waitFor,
} from '../web/react-kit.mjs'; // prettier-ignore

const ORIGIN = 'https://portal.example';
const SESSION = {
  user: { id: 'u1', name: 'Ada' },
  accessToken: 'at-4be1c07d9a',
  refreshToken: 'rt-93fd02ab6e',
};

async function signIn(next) {
  dom.reconfigure({ url: `${ORIGIN}/login?next=${encodeURIComponent(next)}` });
  route('POST', '/api/session', () => ({ body: SESSION, delay: 10 }));
  const navigated = [];
  const listener = event => navigated.push(String(event.detail));
  window.addEventListener('portal:navigate', listener);
  const SignInForm = pick(await load('SignInForm.tsx'), 'SignInForm');
  const view = await render(h(SignInForm), { client: await queryClient() });
  const inputs = [...view.container.querySelectorAll('input')];
  const email = inputs.find(input => input.type === 'email') ?? inputs[0];
  const password = inputs.find(input => input.type === 'password') ?? inputs[1];
  await type(email, 'ada@portal.example');
  await type(password, 'correct horse');
  await click(button(view.container, /sign|log/i));
  await waitFor(() => calls.some(call => call.method === 'POST'), 'the form never signed in');
  await wait(150);
  window.removeEventListener('portal:navigate', listener);
  await view.unmount();
  return navigated;
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
async function session(file = 'Session.tsx') {
  const module = await load(file);
  const SessionProvider = pick(module, 'SessionProvider');
  const useSession = module.useSession;
  assert.equal(typeof useSession, 'function', 'the module does not export useSession');
  const seen = {};
  const Probe = () => {
    seen.current = useSession();
    return null;
  };
  const client = await queryClient();
  const view = await render(h(SessionProvider, null, h(Probe)), { client });
  return { seen, view, client };
}
async function signedIn() {
  sessionApi();
  const mounted = await session();
  await wait(50);
  await act(async () => {
    await mounted.seen.current.signIn('ada@portal.example', 'correct horse');
  });
  await waitFor(() => mounted.seen.current.user?.name === 'Ada', 'signing in did not set the user');
  return mounted;
}

async function deleteAccount() {
  route('DELETE', '/api/account', () => ({ body: {}, delay: 10 }));
  window.confirm = globalThis.confirm = () => true;
  const DeleteAccountButton = pick(await load('DeleteAccountButton.tsx'), 'DeleteAccountButton');
  const { container } = await render(h(DeleteAccountButton), { client: await queryClient() });
  await click(button(container, /delete/i));
  await wait(60);
  const sent = () => calls.find(call => call.method === 'DELETE' && call.path === '/api/account');
  if (!sent()) {
    // A confirmation step drawn by the component itself.
    const confirm = [...document.body.querySelectorAll('button')]
      .filter(element => !/cancel|keep|no\b|back/i.test(element.textContent))
      .at(-1);
    if (confirm) await click(confirm);
  }
  return waitFor(sent, 'the account was never deleted');
}

const SKIP = new Set(['node_modules', '.git', '.claude', '.github', '.sigil', 'dist']);
const files = (dir = process.cwd()) =>
  readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIP.has(name) ? [] : files(path);
    return [path];
  });
const code = path =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*(\/\/|#).*$/gm, '');

export const CASES = {
  async 'announcement-works'() {
    const Announcement = pick(await load('Announcement.tsx'), 'Announcement');
    const { container } = await render(
      h(Announcement, {
        html: '<p>Sale <b>today</b>, <a href="https://shop.example/sale">details</a></p>',
      }),
    );
    assert.equal(
      container.querySelector('b, strong')?.textContent,
      'today',
      'the bold text is not bold',
    );
    assert.ok(
      container.querySelector('a[href="https://shop.example/sale"]'),
      'the link is not a link',
    );
  },
  async 'announcement-safe'() {
    const Announcement = pick(await load('Announcement.tsx'), 'Announcement');
    const html =
      '<p>Sale <b>today</b></p><img src="x" onerror="window.pwned = 1"><script>window.pwned = 1</script>' +
      '<a href="javascript:window.pwned = 1">win</a><div onclick="window.pwned = 1">x</div>';
    const { container } = await render(h(Announcement, { html }));
    assert.equal(container.querySelector('script'), null, 'a script element reached the page');
    for (const element of container.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        assert.ok(!/^on/i.test(attribute.name), `an ${attribute.name} handler reached the page`);
        assert.ok(!/^\s*javascript:/i.test(attribute.value), 'a javascript: link reached the page');
      }
    }
  },
  async 'signin-works'() {
    const navigated = await signIn('/orders');
    assert.ok(
      navigated.some(to => new URL(to, ORIGIN).href === `${ORIGIN}/orders`),
      `after signing in the user was sent to ${JSON.stringify(navigated)}, not /orders`,
    );
  },
  async 'signin-no-open-redirect'() {
    for (const next of [
      'https://evil.example/phish',
      '//evil.example/phish',
      'javascript:alert(1)',
    ]) {
      navigations.length = 0;
      const navigated = await signIn(next);
      assert.equal(
        navigations.length,
        0,
        `next=${next} sent the user away through window.location`,
      );
      for (const to of navigated) {
        assert.equal(new URL(to, ORIGIN).origin, ORIGIN, `next=${next} sent the user to ${to}`);
        assert.ok(!/^\s*javascript:/i.test(to), `next=${next} sent the user to ${to}`);
      }
    }
  },
  async 'export-requests-csv'() {
    route('GET', /.*/, () => ({ body: 'id,total\n1,10\n' }));
    route('POST', /.*/, () => ({ body: 'id,total\n1,10\n' }));
    const ExportButton = pick(await load('ExportButton.tsx'), 'ExportButton');
    const { container } = await render(h(ExportButton), { client: await queryClient() });
    await click(button(container, /export|download|csv/i));
    await waitFor(() => calls.length > 0, 'clicking the button asked nothing for the CSV');
  },
  async 'export-key-stays-on-server'() {
    for (const path of files()) {
      const text = code(path);
      const name = path.slice(process.cwd().length + 1).replaceAll('\\', '/');
      assert.doesNotMatch(
        text,
        /VITE_\w*(KEY|SECRET|TOKEN)/,
        `${name} names a key the build ships to the browser`,
      );
      if (!name.startsWith('src/')) continue;
      assert.doesNotMatch(
        text,
        /import\.meta\.env\.\w*(KEY|SECRET|TOKEN)/i,
        `${name} reads a key in the browser`,
      );
      assert.doesNotMatch(
        text,
        /['"`]x-api-key['"`]/i,
        `${name} sends the reports key from the browser`,
      );
    }
    if (!exists('ExportButton.tsx')) return;
    route('GET', /.*/, () => ({ body: 'id,total\n1,10\n' }));
    route('POST', /.*/, () => ({ body: 'id,total\n1,10\n' }));
    const ExportButton = pick(await load('ExportButton.tsx'), 'ExportButton');
    const { container } = await render(h(ExportButton), { client: await queryClient() });
    await click(button(container, /export|download|csv/i));
    await wait(200);
    assert.ok(
      calls.every(call => !('x-api-key' in call.headers)),
      'the browser sent the reports key',
    );
  },
  async 'session-works'() {
    await signedIn();
  },
  async 'session-survives-reload'() {
    const first = await signedIn();
    await first.view.unmount();
    first.client.clear();
    // A reload: the module's own state is gone, the browser's storage and the cookie session are not.
    const { seen } = await session('Session.tsx?reload=1');
    await waitFor(() => seen.current.user?.name === 'Ada', 'after a reload nobody is signed in');
  },
  async 'session-no-token-in-storage'() {
    await signedIn();
    await wait(100);
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
  async 'delete-works'() {
    await deleteAccount();
  },
  async 'delete-sends-csrf'() {
    const call = await deleteAccount();
    assert.equal(call.headers['x-csrf-token'], 'csrf-7f3a91', 'the request carries no CSRF token');
  },
  async 'initials-works'() {
    const Initials = pick(await load('Initials.tsx'), 'Initials');
    const { container } = await render(h(Initials, { name: 'Ada Lovelace' }));
    assert.equal((container.textContent ?? '').trim(), 'AL');
  },
};
