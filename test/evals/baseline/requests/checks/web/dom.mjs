// A browser page for the project to run in (jsdom), a fake API server behind `fetch`, and what the
// page did that a check wants to see: console output, error reports, navigations, rejections nobody
// handled. Import this before anything that imports React.
/* global process, console, setTimeout, clearTimeout, Response, DOMException, URL, Headers */
import { JSDOM, VirtualConsole } from 'jsdom';

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Navigations the page tried through `window.location`, which jsdom refuses. */
export const navigations = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => {
  if (/navigation/i.test(String(error?.message))) navigations.push(String(error.message));
});

export const dom = new JSDOM(
  '<!doctype html><html><head><meta name="csrf-token" content="csrf-7f3a91"></head><body></body></html>',
  { url: 'https://portal.example/', pretendToBeVisual: true, virtualConsole },
);
const { window } = dom;

// The page's own classes replace node's where both exist: a jsdom node only accepts jsdom events,
// files and form data.
const FROM_PAGE = [
  'window', 'document', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage',
  'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'InputEvent', 'FocusEvent', 'ErrorEvent',
  'File', 'Blob', 'FormData', 'FileReader', 'DOMParser', 'MutationObserver', 'Node', 'Element',
  'Text', 'DocumentFragment', 'NodeFilter', 'XMLSerializer', 'getComputedStyle',
  'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'self', 'top', 'parent', 'screen',
]; // prettier-ignore
for (const key of FROM_PAGE) {
  if (window[key] === undefined) continue;
  Object.defineProperty(globalThis, key, {
    value: window[key],
    configurable: true,
    writable: true,
  });
}
for (const key of Object.getOwnPropertyNames(window)) {
  if (/^(HTML|SVG|DOM|CSS)/.test(key) && !(key in globalThis))
    Object.defineProperty(globalThis, key, {
      value: window[key],
      configurable: true,
      writable: true,
    });
}
// A download is an object URL: node's own would refuse the page's Blob, and jsdom has none.
for (const target of [window.URL, globalThis.URL]) {
  target.createObjectURL = () => 'blob:https://portal.example/download';
  target.revokeObjectURL = () => {};
}
window.scrollTo = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** Every `console.*` call the page made: { level, text }. Nothing is printed. */
export const consoleCalls = [];
const text = value => {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.message} ${value.stack ?? ''}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};
for (const level of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'table', 'dir', 'group']) {
  console[level] = (...args) => consoleCalls.push({ level, text: args.map(text).join(' ') });
  window.console[level] = console[level];
}

/** Bodies sent with `navigator.sendBeacon`: { url, body } with `body` as text. */
export const beacons = [];
window.navigator.sendBeacon = (url, body) => {
  beacons.push({ url: String(url), body: typeof body === 'string' ? body : text(body) });
  return true;
};

/** Reasons of promise rejections nothing handled. */
export const unhandled = [];
process.on('unhandledRejection', reason => unhandled.push(reason));
window.addEventListener('unhandledrejection', event => unhandled.push(event.reason));

/** Calls the page made through `fetch`: { method, url, path, headers, body, signal }. */
export const calls = [];
const routes = [];
/**
 * Answers `method path` (path: a string or a RegExp over the URL's path and query) with what
 * `handler(call)` returns: { status = 200, body = {}, delay = 0 }. Later routes win.
 */
export function route(method, path, handler) {
  routes.unshift({ method, path, handler });
}
const abortError = () => new DOMException('The operation was aborted.', 'AbortError');

window.fetch = globalThis.fetch = async (input, init = {}) => {
  const raw = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
  const url = new URL(raw, window.location.href);
  const headers = {};
  new Headers(init.headers ?? input.headers ?? {}).forEach((value, key) => (headers[key] = value));
  const call = {
    method: (init.method ?? input.method ?? 'GET').toUpperCase(),
    url: url.href,
    origin: url.origin,
    path: url.pathname + url.search,
    headers,
    body: typeof init.body === 'string' ? init.body : init.body,
    signal: init.signal ?? input.signal,
    credentials: init.credentials,
  };
  calls.push(call);
  if (call.signal?.aborted) throw abortError();
  const found = routes.find(
    candidate =>
      candidate.method === call.method &&
      (typeof candidate.path === 'string'
        ? candidate.path === url.pathname || candidate.path === call.path
        : candidate.path.test(call.path)),
  );
  const {
    status = 200,
    body = {},
    delay = 0,
  } = found ? await found.handler(call) : { status: 404 };
  if (delay > 0) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, delay);
      call.signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(abortError());
      });
    });
  }
  if (call.signal?.aborted) throw abortError();
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': typeof body === 'string' ? 'text/plain' : 'application/json' },
  });
};

/** Everything the page wrote where a person or a log reader could see it. */
export const everythingLogged = () =>
  [...consoleCalls.map(call => call.text), ...beacons.map(beacon => beacon.body)].join('\n');
