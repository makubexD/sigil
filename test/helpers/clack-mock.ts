/**
 * @clack/prompts mock for wizard tests.
 *
 * runWizard uses prompts that require a real TTY. Since tests run in a
 * non-TTY environment we mock @clack/prompts by mutating the already-loaded module
 * object in require.cache. The compiled wizard.js accesses prompts via
 * `prompts_1.<fn>(...)`, so mutating the cached exports object's properties is
 * sufficient — no module reload needed.
 *
 * Strategy:
 *   1. Save originals from require.cache at call time (module is already loaded)
 *   2. Replace each prompt function with a queue-driven stub
 *   3. Call runWizard(...) — it drives through the queue
 *   4. Call the returned restore() in finally{} to put the originals back
 *
 * Usage:
 *   const restore = mockClack(['claude', 'browse', '__all__', ...]);
 *   try {
 *     const result = await runWizard(...);
 *     assert.ok(result);
 *   } finally {
 *     restore();
 *   }
 *
 * To see what the user would see (every prompt, log line and note, in order), pass a recorder:
 *   const seen = createRecorder();
 *   const restore = mockClack([ENTER, ENTER], seen);
 */
import { fitView } from '../../dist-cli/wizard/prompt-fit';
import { stripAnsi } from './ansi';

/** A queued answer. A `symbol` simulates Ctrl+C: the mocked `isCancel` returns true for it. */
export type MockAnswer = string | boolean | string[] | symbol;

/** Press Enter: the prompt's preselected value, or its first option when nothing is preselected. */
export const ENTER = '::enter::';

/** One option as the user would see it. */
export interface PromptOption {
  value: string;
  label: string;
  hint?: string | undefined;
}

/** One prompt the code under test showed. */
export interface PromptRecord {
  kind: 'select' | 'multiselect' | 'groupMultiselect' | 'text' | 'confirm';
  message: string;
  options: PromptOption[];
  initialValue?: unknown;
}

/** Everything the user would have seen, in order. */
export interface Recorder {
  prompts: PromptRecord[];
  /** `level: text` for each `log.*` call. */
  logs: string[];
  /** Each `note(body, title)`. */
  notes: Array<{ title: string; body: string }>;
  /** `intro: text`, `outro: text`, `cancel: text`: the frame opens and closes clack drew. */
  frames: string[];
  /** Lines the code wrote with `console.*`; only a journey fills it. */
  console: string[];
  /** Lines printed flush-left for copying (`copyableLine`); only a journey fills it. */
  copied: string[];
}

export function createRecorder(): Recorder {
  return { prompts: [], logs: [], notes: [], frames: [], console: [], copied: [] };
}

/** Decides the answer to a prompt. Lets a test react to what is on screen. */
export type MockDriver = (prompt: PromptRecord) => MockAnswer;

type FitInput = Parameters<typeof fitView>[0];

type RawOptions = {
  message?: unknown;
  options?: unknown;
  initialValue?: unknown;
  defaultValue?: unknown;
};

function flatten(options: unknown): PromptOption[] {
  const list = Array.isArray(options)
    ? options
    : Object.values((options ?? {}) as Record<string, unknown[]>).flat();
  return (list as Array<{ value: unknown; label?: string; hint?: string }>).map(o => ({
    value: String(o.value),
    label: o.label ?? String(o.value),
    hint: o.hint,
  }));
}

function describe(kind: PromptRecord['kind'], raw: RawOptions): PromptRecord {
  const record: PromptRecord = {
    kind,
    message: String(raw.message ?? ''),
    options: flatten(raw.options),
  };
  const initial = raw.initialValue ?? raw.defaultValue;
  if (initial !== undefined) record.initialValue = initial;
  return record;
}

/** What pressing Enter gives for this prompt. */
function enterAnswer(p: PromptRecord): MockAnswer {
  if (p.kind === 'confirm') return typeof p.initialValue === 'boolean' ? p.initialValue : true;
  if (p.kind === 'text') return typeof p.initialValue === 'string' ? p.initialValue : '';
  if (p.initialValue !== undefined) return p.initialValue as MockAnswer;
  return p.options[0]?.value ?? '';
}

/**
 * Set up @clack/prompts mocks that draw answers from a sequential queue, or from a driver.
 * - `select` and `groupMultiselect` return the next value off the queue.
 * - `multiselect` returns the next value as an array (or the value itself if
 *   already an array).
 * - `text` and `confirm` return the next value off the queue.
 * - `ENTER` answers with what pressing Enter would pick.
 * - `isCancel` is true only for a queued `symbol` (simulated Ctrl+C).
 * - `intro`, `outro`, `cancel`, `log` and `note` only record.
 *
 * Returns a `restore()` function that puts the originals back — always call it
 * in a `finally` block.
 *
 * @throws {Error} if the queue is exhausted before all prompts are answered.
 */
export function mockClack(
  answers: MockAnswer[] | MockDriver,
  recorder: Recorder = createRecorder(),
): () => void {
  const clackKey = require.resolve('@clack/prompts');
  const clackMod = require.cache[clackKey] as { exports: Record<string, unknown> };
  const ex = clackMod.exports;
  const orig = { ...ex };

  const ask = (kind: PromptRecord['kind'], raw: unknown): MockAnswer => {
    const prompt = describe(kind, fitView((raw ?? { message: '' }) as FitInput) as RawOptions);
    recorder.prompts.push(prompt);
    let answer: MockAnswer;
    if (typeof answers === 'function') answer = answers(prompt);
    else if (answers.length === 0) throw new Error('clack mock: answer queue exhausted');
    else answer = answers.shift()!;
    return answer === ENTER ? enterAnswer(prompt) : answer;
  };
  const many = (kind: 'multiselect') => async (raw: unknown) => {
    const v = ask(kind, raw);
    if (typeof v === 'symbol') return v;
    return Array.isArray(v) ? v : [v];
  };
  const logLevel = (level: string) => (message: unknown) => {
    recorder.logs.push(`${level}: ${String(message)}`);
  };

  ex['intro'] = (text: unknown) => {
    recorder.frames.push(`intro: ${String(text)}`);
  };
  ex['outro'] = (text: unknown) => {
    recorder.frames.push(`outro: ${String(text)}`);
  };
  ex['note'] = (body: unknown, title?: unknown) => {
    recorder.notes.push({ title: String(title ?? ''), body: String(body) });
  };
  ex['cancel'] = (text: unknown) => {
    recorder.frames.push(`cancel: ${String(text)}`);
  };
  ex['log'] = {
    info: logLevel('info'),
    warn: logLevel('warn'),
    error: logLevel('error'),
    success: logLevel('success'),
    message: logLevel('message'),
    step: logLevel('step'),
  };
  ex['isCancel'] = (value: unknown) => typeof value === 'symbol';
  // The four prompts are our own (`wizard/prompts.ts`), not clack's: replace them there.
  const prompts = require('../../dist-cli/wizard/prompts') as Record<string, unknown>;
  const frame = require('../../dist-cli/wizard/frame') as Record<string, unknown>;
  const replaced = ['select', 'multiselect', 'text', 'confirm'] as const;
  const promptsOrig = Object.fromEntries(replaced.map(name => [name, prompts[name]]));
  const copyOrig = frame['copyableLine'];
  prompts['select'] = async (raw: unknown) => ask('select', raw);
  prompts['multiselect'] = many('multiselect');
  prompts['text'] = async (raw: unknown) => ask('text', raw);
  prompts['confirm'] = async (raw: unknown) => ask('confirm', raw);
  frame['copyableLine'] = (line: unknown) => {
    recorder.copied.push(stripAnsi(String(line)));
  };

  return () => {
    for (const k of Object.keys(orig)) ex[k] = orig[k];
    for (const name of replaced) prompts[name] = promptsOrig[name];
    frame['copyableLine'] = copyOrig;
  };
}

/**
 * For a test file that mocks clack's own exports by hand (`ex['select'] = …`): makes our four
 * prompts call through to whatever clack's `select`, `confirm`, `text` and `multiselect` currently
 * are, so those hand-rolled mocks keep driving them. Call it once at the top of the file; every test
 * file runs in its own process, so nothing leaks.
 */
export function bridgePrompts(): void {
  const prompts = require('../../dist-cli/wizard/prompts') as Record<string, unknown>;
  const clack = require('@clack/prompts') as Record<string, (opts: unknown) => unknown>;
  for (const name of ['select', 'multiselect', 'text', 'confirm']) {
    prompts[name] = (opts: unknown) => clack[name]?.(opts);
  }
}
