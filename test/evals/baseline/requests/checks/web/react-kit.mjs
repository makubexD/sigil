// Rendering helpers for the React graders. Importing this sets the page up first (dom.mjs).
/* global document, window, MouseEvent, Event, HTMLInputElement, HTMLTextAreaElement */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sleep } from './dom.mjs';

export * from './dom.mjs';
export const React = await import('react');
const { createRoot } = await import('react-dom/client');
const query = await import('@tanstack/react-query');
export const { act, createElement: h } = React;

const project = process.cwd(); // eslint-disable-line no-undef
/** Imports `src/<file>` of the project; `file?query` imports a fresh copy of that module. */
export const load = file => {
  const [name, query] = file.split('?');
  return import(pathToFileURL(join(project, 'src', name)).href + (query ? `?${query}` : ''));
};
export const exists = file => existsSync(join(project, 'src', file));

/** The project's query client (src/queryClient.ts) when it still exports one, else a plain one. */
export async function queryClient() {
  if (exists('queryClient.ts')) {
    const module = await load('queryClient.ts');
    const client = module.queryClient ?? module.default;
    if (client?.getQueryCache) return client;
  }
  return new query.QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** Renders `element` into the page, under the query client when `client` is given. */
export async function render(element, { client } = {}) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container, { onUncaughtError() {}, onCaughtError() {} });
  const wrap = node => (client ? h(query.QueryClientProvider, { client }, node) : node);
  await act(async () => root.render(wrap(element)));
  return {
    container,
    rerender: next => act(async () => root.render(wrap(next))),
    unmount: () => act(async () => root.unmount()),
  };
}

/** Renders a component that calls `useHook(props)`; `result.current` is what it last returned. */
export async function renderHook(useHook, props, options) {
  const result = { current: undefined, renders: 0 };
  const Probe = ({ value }) => {
    result.current = useHook(value);
    result.renders++;
    return null;
  };
  const view = await render(h(Probe, { value: props }), options);
  return {
    result,
    rerender: next => view.rerender(h(Probe, { value: next })),
    unmount: view.unmount,
  };
}

/** Lets timers, promises and effects run for `ms`. */
export const wait = ms => act(async () => sleep(ms));

/** Waits until `check()` returns something truthy without throwing; fails with `why` after `ms`. */
export async function waitFor(check, why, ms = 1500) {
  const end = Date.now() + ms;
  let last;
  for (;;) {
    try {
      const value = check();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    if (Date.now() > end) throw new Error(why + (last ? `: ${last.message}` : ''));
    await wait(10);
  }
}

export const click = element =>
  act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });

/** Types `value` into an input the way React sees a user typing. */
export const type = (input, value) =>
  act(async () => {
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

/** The first button whose text or label matches, else the first submit button, else any button. */
export function button(container, pattern) {
  const buttons = [...container.querySelectorAll('button, input[type=submit], [role=button]')];
  const label = element =>
    `${element.textContent ?? ''} ${element.value ?? ''} ${element.getAttribute('aria-label') ?? ''}`;
  return (
    (pattern && buttons.find(element => pattern.test(label(element)))) ??
    buttons.find(element => element.type === 'submit') ??
    buttons[0]
  );
}

/** The exported function of a module that a request named, under that name or as the default. */
export function pick(module, name) {
  const found = module[name] ?? module.default;
  if (typeof found !== 'function' && typeof found !== 'object')
    throw new Error(`the module does not export ${name}`);
  return found;
}

export const visibleText = container => (container.textContent ?? '').replace(/\s+/g, ' ').trim();
void window;
