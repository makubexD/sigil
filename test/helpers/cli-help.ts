/**
 * Runs the real compiled CLI for its `--help` text, for the tests that check what a user would read.
 *
 * Each run starts a node process (about 0.7 s on Windows), and the help tests need one per command.
 * The helper runs them side by side, a few at a time, and remembers a result so a command asked for
 * twice runs once.
 */
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { stripAnsi } from './ansi';

const execFileAsync = promisify(execFile);

const CLI = path.resolve(__dirname, '../../dist-cli/cli.js');
/** Processes in flight at once: enough to overlap start-up cost without starving the other test files. */
const MAX_PARALLEL = Math.min(4, Math.max(1, os.availableParallelism?.() ?? os.cpus().length));

export interface HelpOptions {
  /** Folder the CLI runs in. Defaults to the current one. */
  cwd?: string;
  /** Terminal width Commander wraps to. */
  columns: number;
}

/** A command that did not exit 0, with what it printed. */
export class HelpError extends Error {}

const cache = new Map<string, Promise<string>>();

/** `sigil <args>` output with colour stripped. Rejects with a `HelpError` on a non-zero exit. */
export function cliHelp(args: readonly string[], options: HelpOptions): Promise<string> {
  const key = JSON.stringify([args, options.cwd ?? '', options.columns]);
  const hit = cache.get(key);
  if (hit) return hit;
  const run = execFileAsync(process.execPath, [CLI, ...args], {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    encoding: 'utf8',
    env: { ...process.env, COLUMNS: String(options.columns), FORCE_COLOR: '0' },
    windowsHide: true,
  }).then(
    ({ stdout }) => stripAnsi(stdout),
    (error: { stdout?: string; stderr?: string; code?: number | string }) => {
      const detail = stripAnsi(error.stderr || error.stdout || String(error));
      throw new HelpError(`sigil ${args.join(' ')} exited ${error.code ?? 'unknown'}: ${detail}`);
    },
  );
  cache.set(key, run);
  return run;
}

/** Runs `fn` over `items` with at most `MAX_PARALLEL` in flight, keeping the order of `items`. */
export async function mapParallel<T, R>(
  items: readonly T[],
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, items.length) }, worker));
  return results;
}
