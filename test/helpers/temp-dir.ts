/**
 * Temp-directory lifecycle helpers for tests.
 *
 * Replaces the ~24 hand-rolled mkdtempSync + try/finally + rmSync blocks.
 * `withTempDir` is synchronous; `withTempDirAsync` is for async test bodies.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

/** Create a temporary directory and return its absolute path. */
export function makeTempDir(prefix = 'sigil-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Run `fn(dir)` inside a fresh temp dir, then remove it even if `fn` throws. */
export function withTempDir(fn: (dir: string) => void, prefix?: string): void {
  const dir = makeTempDir(prefix);
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Async variant of `withTempDir`. */
export async function withTempDirAsync(
  fn: (dir: string) => Promise<void>,
  prefix?: string,
): Promise<void> {
  const dir = makeTempDir(prefix);
  try {
    await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
