/**
 * Helpers for driving the whole home menu the way a person would: real handlers, a temp folder,
 * and a recorder that keeps everything the person would have seen, in order.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runHome } from '../../dist-cli/wizard/home';
import type { HomeDeps } from '../../dist-cli/wizard/home';
import { defaultHomeDeps } from '../../dist-cli/wizard/home-actions';
import { createRecorder, mockClack } from './clack-mock';
import type { MockAnswer, MockDriver, PromptRecord, Recorder } from './clack-mock';
import { fakeTTY } from './tty';

/** Ctrl+C. */
export const CANCEL = Symbol('cancel');

export const MENU = 'What would you like to do?';
export const NEXT = 'What next?';
export const SCOPE = 'What would you like to install?';
export const TOOL_QUESTION = /^Which AI tool is this install for\?/;
export const INIT_QUESTION = 'Which AI tool is this project for?';
export const PACK_QUESTION = 'Which pack?';
export const PROCEED_QUESTION = 'Ready to install?';
export const GUARD = /^Where should sigil /;
export const PICKER = /^Pick your project folder/;

export const CATALOG_DIR = path.resolve(__dirname, '../../catalog');
export const PACKS_FILE = path.resolve(__dirname, '../../packs.yaml');

export const isMenu = (p: PromptRecord): boolean => p.message === MENU;
export const isNext = (p: PromptRecord): boolean => p.message === NEXT;
export const menus = (rec: Recorder): PromptRecord[] => rec.prompts.filter(isMenu);
export const nexts = (rec: Recorder): PromptRecord[] => rec.prompts.filter(isNext);
export const asked = (rec: Recorder, message: string | RegExp): PromptRecord[] =>
  rec.prompts.filter(p =>
    typeof message === 'string' ? p.message === message : message.test(p.message),
  );

/** The questions shown, as short tags, so a journey reads as a list: menu, guard, picker, scope… */
export function flow(rec: Recorder): string[] {
  return rec.prompts.map(p => {
    if (isMenu(p)) return 'menu';
    if (isNext(p)) return 'next';
    if (p.message === SCOPE) return 'scope';
    if (p.message === INIT_QUESTION) return 'init-tool';
    if (p.message === PACK_QUESTION) return 'pack';
    if (p.message === PROCEED_QUESTION) return 'proceed';
    if (TOOL_QUESTION.test(p.message)) return 'tool';
    if (GUARD.test(p.message)) return 'guard';
    if (PICKER.test(p.message)) return 'picker';
    return p.message;
  });
}

/** A folder that looks like a sigil catalog checkout, so installs into it are risky. */
export function makeCheckout(dir: string): void {
  fs.mkdirSync(path.join(dir, 'catalog'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'packs.yaml'), 'packs: []\n');
}

/** A folder an ordinary project would be: it has a project file, so nothing is risky. */
export function makeProject(dir: string, tools: readonly string[] = []): void {
  makeTools(dir, tools);
  fs.writeFileSync(path.join(dir, 'package.json'), '{}\n');
}

const TOOL_MARKER: Record<string, string> = { claude: '.claude', copilot: '.github/prompts' };

/** The folder each tool leaves behind when set up, so a folder can be "set up for" any of them. */
export function makeTools(dir: string, tools: readonly string[]): void {
  fs.mkdirSync(dir, { recursive: true });
  for (const tool of tools) {
    fs.mkdirSync(path.join(dir, TOOL_MARKER[tool] ?? `.${tool}`), { recursive: true });
  }
}

/** Every file and folder under `dir`, relative and sorted: a cheap "did anything get written?". */
export function snapshot(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      out.push(path.relative(dir, full));
      if (entry.isDirectory()) walk(full);
    }
  };
  walk(dir);
  return out.sort();
}

/** The invariant behind the broken guard prompt: clack draws its gutter only on the first line. */
export function assertSingleLine(rec: Recorder): void {
  for (const p of rec.prompts) {
    assert.doesNotMatch(
      p.message,
      /\n/,
      `prompt message spans lines: ${JSON.stringify(p.message)}`,
    );
    for (const o of p.options) {
      assert.doesNotMatch(o.label, /\n/, `option label spans lines: ${JSON.stringify(o.label)}`);
    }
  }
}

/** One intro and one outro for the whole session: a wizard run from the menu opens no second frame. */
export function assertOneFrame(rec: Recorder): void {
  assert.deepEqual(
    rec.frames.map(f => f.split(':')[0]),
    ['intro', 'outro'],
    `frames drawn: ${JSON.stringify(rec.frames)}`,
  );
}

/** Plain command output inside the menu stays in the gutter: every line starts with the bar. */
export function assertGuttered(rec: Recorder): void {
  for (const line of rec.console) {
    // eslint-disable-next-line no-control-regex
    const plain = line.replace(/[[0-9;]*m/g, '');
    assert.match(plain, /^│/, `console line outside the gutter: ${JSON.stringify(line)}`);
  }
}

export interface JourneyOptions {
  homeDir?: string;
  deps?: HomeDeps;
}

/** Runs the home menu in a fake terminal against `dir`. Console output goes to `rec.console`. */
export async function journey(
  dir: string,
  answers: MockAnswer[] | MockDriver,
  opts: JourneyOptions = {},
): Promise<Recorder> {
  const rec = createRecorder();
  const restoreTTY = fakeTTY();
  const restore = mockClack(answers, rec);
  const originals = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  const capture = (...args: unknown[]): void => void rec.console.push(args.map(String).join(' '));
  Object.assign(console, { log: capture, info: capture, warn: capture, error: capture });
  try {
    const deps = opts.deps ?? defaultHomeDeps(() => {});
    await runHome(dir, { ...deps, homeDir: opts.homeDir ?? '/nowhere/home' });
  } finally {
    Object.assign(console, originals);
    restore();
    restoreTTY();
  }
  assertSingleLine(rec);
  assertOneFrame(rec);
  assertGuttered(rec);
  return rec;
}

/** The folder shown in the latest "This folder" header. */
export function shownFolder(rec: Recorder): string | undefined {
  const last = [...rec.notes].reverse().find(n => n.title === 'This folder');
  return last?.body.match(/^Folder:\s+(.*)$/m)?.[1]?.trim();
}

/**
 * A driver that presses Enter everywhere, except where `overrides` answers a prompt by its
 * message. `quitAfter` makes every menu from that count on answer "quit", so a flow that would
 * otherwise repeat ends.
 */
export function enterExcept(
  overrides: Array<[RegExp | string, MockAnswer]>,
  quitAfter = Infinity,
): MockDriver {
  let menusSeen = 0;
  return prompt => {
    if (isMenu(prompt) || isNext(prompt)) {
      menusSeen += 1;
      if (menusSeen > quitAfter) return 'quit';
    }
    for (const [match, answer] of overrides) {
      const hit = typeof match === 'string' ? prompt.message === match : match.test(prompt.message);
      if (hit) return answer;
    }
    return '::enter::';
  };
}
