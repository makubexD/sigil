// Hidden behaviour tests for requests/react-logging.json (README, Grading).
/* global File, Event */
import assert from 'node:assert/strict';
import {
  act, beacons, button, calls, click, consoleCalls, everythingLogged, h, load, pick, queryClient,
  render, renderHook, route, type, visibleText, wait, waitFor,
} from '../web/react-kit.mjs'; // prettier-ignore

const FAILURE = /fail|error|couldn.t|could not|unable|try again|went wrong|problem|not uploaded/i;

async function upload(file) {
  route('PUT', '/api/avatar', () => ({ body: { url: '/avatars/u1.png' }, delay: 10 }));
  const AvatarUpload = pick(await load('AvatarUpload.tsx'), 'AvatarUpload');
  const view = await render(h(AvatarUpload), { client: await queryClient() });
  const input = view.container.querySelector('input[type=file]');
  assert.ok(input, 'there is no file input');
  const list = [file];
  list.item = index => list[index] ?? null;
  Object.defineProperty(input, 'files', { value: list, configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await wait(60);
  const send = button(view.container, /upload|save|send/i);
  if (send && calls.length === 0 && !send.disabled) await click(send);
  await wait(200);
  return view;
}
const picture = () => new File([new Uint8Array(2048)], 'me.png', { type: 'image/png' });
const undecodable = () => new File([], 'me.png', { type: 'image/png' });

function Sidebar({ children }) {
  return h('aside', null, children);
}
const explode = () => {
  throw new Error('kaboom');
};
function Gauge() {
  explode();
  return null;
}
async function boundary() {
  const ErrorBoundary = pick(await load('ErrorBoundary.tsx'), 'ErrorBoundary');
  const view = await render(
    h(ErrorBoundary, { fallback: h('p', null, 'Something broke') }, h(Sidebar, null, h(Gauge))),
  );
  await wait(100);
  return view;
}

const BUYER = { name: 'Grace Hopper', email: 'grace@navy.example', card: '4242424242424242' };
async function checkout(status) {
  route('POST', '/api/payments', () => (status === 200 ? { body: { receipt: 'r1' } } : { status }));
  const CheckoutForm = pick(await load('CheckoutForm.tsx'), 'CheckoutForm');
  const view = await render(h(CheckoutForm), { client: await queryClient() });
  const inputs = [...view.container.querySelectorAll('input')];
  const hint = input =>
    `${input.type} ${input.name} ${input.id} ${input.placeholder} ${input.getAttribute('aria-label') ?? ''} ` +
    `${input.autocomplete} ${input.closest('label')?.textContent ?? ''} ` +
    `${input.id ? (view.container.querySelector(`label[for="${input.id}"]`)?.textContent ?? '') : ''}`;
  const find = (pattern, fallback) =>
    inputs.find(input => pattern.test(hint(input))) ?? inputs[fallback];
  const email = find(/mail/i, 1);
  const card = find(/card|cc-number/i, 2);
  const name =
    inputs.find(input => input !== email && input !== card && /name/i.test(hint(input))) ??
    inputs[0];
  await type(name, BUYER.name);
  await type(email, BUYER.email);
  await type(card, BUYER.card);
  await click(button(view.container, /pay|submit|check|order|buy/i));
  await wait(300);
  return view;
}

const PRODUCTS = [
  { id: '1', title: 'Desk lamp', price: 20 },
  { id: '2', title: 'Bookshelf', price: 75 },
];

async function invoices(status) {
  route('GET', '/api/invoices', () =>
    status === 200 ? { body: [{ id: 'i1', amount: 40 }], delay: 10 } : { status, delay: 10 },
  );
  const useInvoices = pick(await load('useInvoices.ts'), 'useInvoices');
  const { result } = await renderHook(useInvoices, undefined, { client: await queryClient() });
  return result;
}

export const CASES = {
  async 'upload-works'() {
    await upload(picture());
    assert.ok(
      calls.some(call => call.method === 'PUT' && call.path === '/api/avatar'),
      'the picture was never sent',
    );
  },
  async 'upload-failure-shown'() {
    const { container } = await upload(undecodable());
    assert.ok(
      container.querySelector('[role=alert]') || FAILURE.test(visibleText(container)),
      'a picture that cannot be prepared shows the user nothing',
    );
  },
  async 'upload-failure-reported'() {
    await upload(undecodable());
    assert.ok(beacons.length > 0, 'a picture that cannot be prepared never reaches error tracking');
  },
  async 'boundary-works'() {
    const { container } = await boundary();
    assert.match(visibleText(container), /Something broke/, 'the fallback is not shown');
  },
  async 'boundary-reports'() {
    await boundary();
    assert.ok(
      beacons.some(beacon => beacon.body.includes('kaboom')),
      'the error never reaches error tracking',
    );
  },
  async 'boundary-reports-where'() {
    await boundary();
    assert.ok(
      beacons.some(beacon => beacon.body.includes('Sidebar')),
      'the report does not say where in the component tree the error happened',
    );
  },
  async 'checkout-works'() {
    await checkout(200);
    const sent = calls.find(call => call.method === 'POST' && call.path === '/api/payments');
    assert.ok(sent, 'the payment was never sent');
    assert.ok(sent.body.includes(BUYER.email) && sent.body.replace(/\s/g, '').includes(BUYER.card));
  },
  async 'checkout-no-personal-data'() {
    await checkout(402);
    assert.ok(
      calls.some(call => call.path === '/api/payments'),
      'the payment was never sent',
    );
    const logged = everythingLogged();
    assert.ok(
      !logged.includes(BUYER.email),
      "the buyer's email is in the logs or the error report",
    );
    assert.ok(!logged.includes(BUYER.name), "the buyer's name is in the logs or the error report");
    assert.ok(
      !logged.replace(/[\s-]/g, '').includes(BUYER.card),
      'the card number is in the logs or the error report',
    );
  },
  async 'results-works'() {
    const ResultsList = pick(await load('ResultsList.tsx'), 'ResultsList');
    const { container } = await render(h(ResultsList, { results: PRODUCTS }));
    const text = visibleText(container);
    assert.ok(
      /Desk lamp/.test(text) && /Bookshelf/.test(text) && /20/.test(text) && /75/.test(text),
    );
  },
  async 'results-log-not-per-render'() {
    const ResultsList = pick(await load('ResultsList.tsx'), 'ResultsList');
    const view = await render(h(ResultsList, { results: PRODUCTS }));
    for (let i = 0; i < 5; i++) await view.rerender(h(ResultsList, { results: PRODUCTS }));
    const logs = consoleCalls.filter(call => ['log', 'info', 'debug'].includes(call.level)).length;
    assert.ok(logs <= 1, `six renders of the same results logged ${logs} times`);
  },
  async 'invoices-works'() {
    const result = await invoices(200);
    await waitFor(
      () => (result.current?.invoices ?? result.current?.data)?.[0]?.id === 'i1',
      'the invoices never arrived',
    );
  },
  async 'invoices-failure-surfaces'() {
    const result = await invoices(500);
    await waitFor(
      () => result.current?.error,
      'a refused load leaves no error for the screen to show',
    );
  },
  async 'invoices-reported-once'() {
    await invoices(500);
    await wait(400);
    assert.equal(beacons.length, 1, `one refused load was reported ${beacons.length} times`);
  },
  async 'initials-works'() {
    const Initials = pick(await load('Initials.tsx'), 'Initials');
    const { container } = await render(h(Initials, { name: 'Ada Lovelace' }));
    assert.equal(visibleText(container), 'AL');
  },
};
