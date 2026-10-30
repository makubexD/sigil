/**
 * scripts/check-marketplace-drift.cjs is the drift gate for the `marketplace` branch: the release
 * workflow publishes a fresh `--target claude` build there, and the gate proves the branch still
 * equals a fresh build of its tag. These cases drive the real script against real build output,
 * checking the exit-code and report contract the CI job leans on.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { withTempDirAsync } from '../helpers/temp-dir';

const ROOT = path.resolve(__dirname, '../..');
const CLI = path.join(ROOT, 'dist-cli', 'cli.js');
const SCRIPT = path.join(ROOT, 'scripts', 'check-marketplace-drift.cjs');

interface ScriptResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Runs the drift script with `args`; `cwd` is the repo root, as CI invokes it. */
function runScript(...args: string[]): ScriptResult {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Builds `--target claude` into `outDir` and returns `<outDir>/claude`, the published shape. */
function buildPublished(outDir: string): string {
  execFileSync(process.execPath, [CLI, 'build', '--target', 'claude', '--out-dir', outDir], {
    cwd: ROOT,
    stdio: 'ignore',
    windowsHide: true,
  });
  return path.join(outDir, 'claude');
}

/** POSIX relative path of the lexicographically first file named `name` under `root`. */
function firstFileNamed(root: string, name: string): string {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name === name) {
        found.push(path.relative(root, full).split(path.sep).join('/'));
      }
    }
  };
  walk(root);
  found.sort();
  assert.ok(found.length > 0, `expected at least one ${name}`);
  return found[0] as string;
}

/** Absolute path of a POSIX relative path under `root`. */
function resolveIn(root: string, rel: string): string {
  return path.join(root, ...rel.split('/'));
}

describe('marketplace-drift check', () => {
  it('should pass when the published tree equals a fresh build', async () => {
    await withTempDirAsync(async dir => {
      const published = buildPublished(path.join(dir, 'expected'));

      const result = runScript(published);

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /✓ marketplace matches a fresh build \(\d+ files\)/);
    });
  });

  it('should report an edited file as changed', async () => {
    await withTempDirAsync(async dir => {
      const published = buildPublished(path.join(dir, 'expected'));
      const rel = firstFileNamed(published, 'SKILL.md');
      fs.appendFileSync(resolveIn(published, rel), '\n<!-- hand edit -->\n');

      const result = runScript(published);

      assert.equal(result.status, 1, result.stderr);
      assert.ok(result.stdout.includes(`changed ${rel}`), result.stdout);
    });
  });

  it('should report a deleted file as removed', async () => {
    await withTempDirAsync(async dir => {
      const published = buildPublished(path.join(dir, 'expected'));
      const rel = firstFileNamed(published, 'SKILL.md');
      fs.rmSync(resolveIn(published, rel));

      const result = runScript(published);

      assert.equal(result.status, 1, result.stderr);
      assert.ok(result.stdout.includes(`removed ${rel}`), result.stdout);
    });
  });

  it('should report an extra file as added', async () => {
    await withTempDirAsync(async dir => {
      const published = buildPublished(path.join(dir, 'expected'));
      fs.writeFileSync(path.join(published, 'extra-note.md'), 'not in the build\n');

      const result = runScript(published);

      assert.equal(result.status, 1, result.stderr);
      assert.ok(result.stdout.includes('added   extra-note.md'), result.stdout);
    });
  });

  it('should ignore a top-level .git entry', async () => {
    await withTempDirAsync(async dir => {
      const published = buildPublished(path.join(dir, 'expected'));
      fs.mkdirSync(path.join(published, '.git'));
      fs.writeFileSync(path.join(published, '.git', 'HEAD'), 'ref: refs/heads/marketplace\n');

      const result = runScript(published);

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /✓ marketplace matches/);
    });
  });

  it('should exit 2 when no published dir is given', () => {
    const result = runScript();

    assert.equal(result.status, 2);
    assert.match(result.stderr, /Usage:/);
  });
});
