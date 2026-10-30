/**
 * `sigil build --target claude` must be byte-for-byte reproducible: the marketplace publish
 * commits a fresh build to a branch, and the drift gate compares that published tree with
 * another fresh build of the same tag. Any output drift (path order, dates, locale-dependent
 * collation) shows up as a false drift failure.
 *
 * Each build runs as its own child process of the compiled CLI, never in-process: Node fixes
 * its default ICU locale at start-up, so setting LC_ALL/LANG mid-process has no effect, and a
 * second in-process build could reuse in-memory state.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { CATALOG, PACKS } from '../helpers/install-scenario';
import { withTempDirAsync } from '../helpers/temp-dir';

const execFileAsync = promisify(execFile);
const CLI = path.resolve(__dirname, '../../dist-cli/cli.js');

/** Runs `build --target claude` into `outDir` as a separate CLI process. */
async function buildInto(outDir: string, extraEnv: NodeJS.ProcessEnv = {}): Promise<void> {
  await execFileAsync(
    process.execPath,
    [
      CLI,
      'build',
      '--target',
      'claude',
      '--catalog-dir',
      CATALOG,
      '--packs',
      PACKS,
      '--out-dir',
      outDir,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, ...extraEnv },
      windowsHide: true,
    },
  );
}

/**
 * Byte-exact recursive snapshot of `root`: every regular file's POSIX-relative path mapped to a
 * short sha256 hex of its raw contents, with keys sorted so `deepStrictEqual` compares order
 * too. Hashes keep a mismatch readable — it still names the file, and prints a short hash rather
 * than the whole file.
 */
function fileMap(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const rel = path.relative(root, full).split(path.sep).join('/');
        files[rel] = createHash('sha256').update(fs.readFileSync(full)).digest('hex');
      }
    }
  };
  walk(root);
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(files).sort()) sorted[key] = files[key] as string;
  return sorted;
}

/** Reads `<outDir>/registry.json` with its timestamp removed. */
function registryWithoutTimestamp(outDir: string): Record<string, unknown> {
  const registry = JSON.parse(
    fs.readFileSync(path.join(outDir, 'registry.json'), 'utf8'),
  ) as Record<string, unknown> & { generatedAt?: string };
  delete registry.generatedAt;
  return registry;
}

describe('build determinism', () => {
  it('should emit identical claude/ trees from two builds', async () => {
    await withTempDirAsync(async root => {
      const first = path.join(root, 'first');
      const second = path.join(root, 'second');
      await buildInto(first);
      await buildInto(second);

      assert.deepEqual(
        fileMap(path.join(second, 'claude')),
        fileMap(path.join(first, 'claude')),
        'two builds of the same catalog must be byte-identical',
      );
    });
  });

  it('should emit identical claude/ trees under a different TZ and locale', async () => {
    await withTempDirAsync(async root => {
      const first = path.join(root, 'first');
      const second = path.join(root, 'second');
      await buildInto(first);
      await buildInto(second, {
        TZ: 'Asia/Tokyo',
        LC_ALL: 'tr_TR.UTF-8',
        LANG: 'tr_TR.UTF-8',
      });

      assert.deepEqual(
        fileMap(path.join(second, 'claude')),
        fileMap(path.join(first, 'claude')),
        'TZ and locale must not change the emitted tree',
      );
    });
  });

  it('should emit identical registry.json apart from the timestamp', async () => {
    await withTempDirAsync(async root => {
      const first = path.join(root, 'first');
      const second = path.join(root, 'second');
      await buildInto(first);
      await buildInto(second);

      assert.deepEqual(
        registryWithoutTimestamp(second),
        registryWithoutTimestamp(first),
        'registry.json must differ only in generatedAt',
      );
    });
  });
});
