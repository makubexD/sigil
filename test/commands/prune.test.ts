/**
 * Tests for `sigil prune` (src/commands/prune.ts) — drives the compiled CLI as a subprocess,
 * same convention as test/characterization.test.ts, since prune (like add/status/update) reads
 * real manifest/catalog state rather than being a pure function.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { withTempDir } from '../helpers/temp-dir';
import { CATALOG_DIR } from '../helpers/catalog';
import { stripAnsi } from '../helpers/ansi';

const CLI = path.resolve(__dirname, '../../dist-cli/cli.js');
const PACKS_FILE = path.resolve(CATALOG_DIR, '../packs.yaml');
const CATALOG_ARGS = ['--catalog-dir', CATALOG_DIR, '--packs', PACKS_FILE];

interface CliResult {
  stdout: string;
  stderr: string;
  status: number;
}

function runCli(args: string[], cwd: string): CliResult {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf-8' });
    return { stdout: stripAnsi(stdout), stderr: '', status: 0 };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number | null };
    return {
      stdout: stripAnsi(err.stdout ?? ''),
      stderr: stripAnsi(err.stderr ?? ''),
      status: err.status ?? 1,
    };
  }
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

/** Installs shared/explain-diff for real, then hand-inserts a second, orphaned manifest entry
 * pointing at an id that doesn't exist in the catalog — the exact shape `sigil update` or a
 * catalog removal leaves behind. `content` becomes the orphaned file's on-disk bytes; pass a
 * value matching `recordedContent` to simulate an untouched file, or a different value to
 * simulate a local edit (drift). */
function seedOrphan(dir: string, recordedContent: string, onDiskContent: string): void {
  runCli(
    ['add', 'shared/explain-diff', '--target', 'claude', '--project-dir', dir, ...CATALOG_ARGS],
    dir,
  );

  const manifestPath = path.join(dir, '.sigil/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const ghostPath = '.claude/skills/ghost-orphan/SKILL.md';
  manifest.entries.push({
    id: 'shared/does-not-exist-in-catalog',
    kind: 'prompt',
    target: 'claude',
    sigilVersion: '0.1.0',
    files: [{ path: ghostPath, sha256: sha256(recordedContent) }],
    dependentOf: [],
    installedAt: new Date().toISOString(),
  });
  fs.mkdirSync(path.dirname(path.join(dir, ghostPath)), { recursive: true });
  fs.writeFileSync(path.join(dir, ghostPath), onDiskContent);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

describe('sigil prune — preview (default, no --apply)', () => {
  it('reports nothing to prune for a clean install', () => {
    withTempDir(dir => {
      runCli(
        ['add', 'shared/explain-diff', '--target', 'claude', '--project-dir', dir, ...CATALOG_ARGS],
        dir,
      );

      const result = runCli(['prune', '--project-dir', dir, ...CATALOG_ARGS], dir);

      assert.equal(result.status, 0);
      assert.match(result.stdout, /Nothing to prune/);
    });
  });

  it('lists an orphaned entry and does not delete anything', () => {
    withTempDir(dir => {
      seedOrphan(dir, 'ghost content', 'ghost content');
      const ghostFile = path.join(dir, '.claude/skills/ghost-orphan/SKILL.md');

      const result = runCli(['prune', '--project-dir', dir, ...CATALOG_ARGS], dir);

      assert.equal(result.status, 0);
      assert.match(result.stdout, /1 orphaned artifact/);
      assert.match(result.stdout, /shared\/does-not-exist-in-catalog/);
      assert.ok(fs.existsSync(ghostFile), 'preview mode must not delete files');
    });
  });
});

describe('sigil prune --apply', () => {
  it('removes an unmodified orphaned entry and its file', () => {
    withTempDir(dir => {
      seedOrphan(dir, 'ghost content', 'ghost content');
      const ghostFile = path.join(dir, '.claude/skills/ghost-orphan/SKILL.md');

      const result = runCli(
        ['prune', '--project-dir', dir, '--apply', '--yes', ...CATALOG_ARGS],
        dir,
      );

      assert.equal(result.status, 0);
      assert.match(result.stdout, /Pruned 1 orphaned artifact/);
      assert.ok(!fs.existsSync(ghostFile), 'orphaned file should be deleted');

      const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.sigil/manifest.json'), 'utf-8'));
      assert.ok(
        !manifest.entries.some((e: { id: string }) => e.id === 'shared/does-not-exist-in-catalog'),
        'orphaned entry must be removed from the manifest',
      );
    });
  });

  it('keeps a hand-edited (drifted) orphaned file without --force', () => {
    withTempDir(dir => {
      seedOrphan(dir, 'original recorded content', 'hand-edited by the user');
      const ghostFile = path.join(dir, '.claude/skills/ghost-orphan/SKILL.md');

      const result = runCli(
        ['prune', '--project-dir', dir, '--apply', '--yes', ...CATALOG_ARGS],
        dir,
      );

      assert.equal(result.status, 0);
      assert.equal(
        fs.readFileSync(ghostFile, 'utf-8'),
        'hand-edited by the user',
        'a locally-edited orphaned file must never be silently deleted',
      );
    });
  });

  it('removes a drifted orphaned file when --force is set', () => {
    withTempDir(dir => {
      seedOrphan(dir, 'original recorded content', 'hand-edited by the user');
      const ghostFile = path.join(dir, '.claude/skills/ghost-orphan/SKILL.md');

      const result = runCli(
        ['prune', '--project-dir', dir, '--apply', '--yes', '--force', ...CATALOG_ARGS],
        dir,
      );

      assert.equal(result.status, 0);
      assert.ok(!fs.existsSync(ghostFile), '--force removes even a drifted orphaned file');
    });
  });
});
