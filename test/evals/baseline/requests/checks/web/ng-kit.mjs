// Helpers for the Angular graders. Importing this sets the page up first (dom.mjs), then Angular's
// compiler and test bed.
/* global process */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sleep } from './dom.mjs';

export * from './dom.mjs';

// Constructor injection reads the parameter types TypeScript emits as metadata (hooks.mjs).
const metadata = new WeakMap();
Reflect.metadata ??= (key, value) => target => {
  metadata.set(target, { ...metadata.get(target), [key]: value });
};
Reflect.getOwnMetadata ??= (key, target) => metadata.get(target)?.[key];

await import('@angular/compiler');
export const core = await import('@angular/core');
export const { TestBed } = await import('@angular/core/testing');
export const http = await import('@angular/common/http');
export const rx = await import('rxjs');
const browser = await import('@angular/platform-browser/testing');
// As shipped: `isDevMode()` is false, so output a project keeps for development stays quiet.
core.enableProdMode();
TestBed.initTestEnvironment(browser.BrowserTestingModule, browser.platformBrowserTesting());

const project = process.cwd();
/** Imports `src/app/<file>` of the project. */
export const load = file => import(pathToFileURL(join(project, 'src', 'app', file)).href);
export const exists = file => existsSync(join(project, 'src', 'app', file));

/** A fresh application: the project's own providers (app.config.ts), then `providers` over them. */
export async function app(providers = []) {
  TestBed.resetTestingModule();
  let own = [http.provideHttpClient(http.withFetch())];
  if (exists('app.config.ts')) {
    const config = (await load('app.config.ts')).appConfig;
    if (Array.isArray(config?.providers)) own = config.providers;
  }
  TestBed.configureTestingModule({ providers: [...own, ...providers] });
  return TestBed;
}

/** Lets the component render and its pending work finish, for at least `ms`. */
export async function settle(fixture, ms = 0) {
  fixture.detectChanges();
  await sleep(ms);
  await fixture.whenStable();
  fixture.detectChanges();
}

export async function mount(Component) {
  const fixture = TestBed.createComponent(Component);
  await settle(fixture);
  return fixture;
}

/** Waits until `check()` is truthy without throwing; fails with `why` after `ms`. */
export async function waitFor(check, why, { ms = 1500, fixture } = {}) {
  const end = Date.now() + ms;
  let last;
  for (;;) {
    try {
      fixture?.detectChanges();
      const value = check();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    if (Date.now() > end) throw new Error(why + (last ? `: ${last.message}` : ''));
    await sleep(10);
  }
}

/** The class a request named, under that name or the module's only class. */
export function pick(module, name) {
  if (typeof module[name] === 'function') return module[name];
  const classes = Object.values(module).filter(value => typeof value === 'function');
  if (classes.length === 1) return classes[0];
  throw new Error(`the module does not export ${name}`);
}

/** A method of `target` under one of `names`. */
export function method(target, ...names) {
  const name = names.find(candidate => typeof target[candidate] === 'function');
  if (!name) throw new Error(`no ${names[0]} method`);
  return target[name].bind(target);
}

export const textOf = fixture =>
  (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ').trim();

const SKIP = new Set(['node_modules', '.git', '.claude', '.github', '.sigil', 'dist']);
const walk = dir =>
  readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIP.has(name) ? [] : walk(path);
    return [path];
  });
/** The project's source under src/, comments removed: [{ name, text }]. */
export const sources = () =>
  walk(join(project, 'src')).map(path => ({
    name: path.slice(project.length + 1).replaceAll('\\', '/'),
    text: readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, ''),
  }));
