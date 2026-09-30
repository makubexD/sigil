/**
 * Characterization tests for src/commands/* + src/cli.ts (A0 in the quality-elevation plan).
 *
 * Pins the CURRENT behavior of the command layer before it is refactored (SigilError +
 * single exit point, wizard step registry, runAdd plan/execute split). src/commands/ has
 * zero unit coverage today because every handler calls process.exit() directly, which
 * kills the test runner — so these tests drive the compiled CLI as a subprocess instead.
 *
 * These snapshots are the gate for the A3-A7 refactor phases: stdout and exit code here
 * must stay byte-identical (module structure may change; user-visible behavior must not).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { withTempDir } from './helpers/temp-dir';
import { CATALOG_DIR } from './helpers/catalog';
import { stripAnsi } from './helpers/ansi';

const CLI = path.resolve(__dirname, '../dist-cli/cli.js');

interface CliResult {
  stdout: string;
  stderr: string;
  status: number;
}

/** Run the compiled CLI as a subprocess and capture stdout/stderr/exit code (never throws). */
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

const PACKS_FILE = path.resolve(CATALOG_DIR, '../packs.yaml');
/** For commands that accept both --catalog-dir and --packs (build/validate/index/add/status/update). */
const CATALOG_ARGS = ['--catalog-dir', CATALOG_DIR, '--packs', PACKS_FILE];
/** For commands that accept only --catalog-dir (get/search/new/check/patch/move/retarget/edit/delete). */
const CATALOG_ONLY_ARGS = ['--catalog-dir', CATALOG_DIR];

describe('characterization — sigil add', () => {
  it('add --dry-run previews without writing files', () => {
    withTempDir(dir => {
      const result = runCli(
        [
          'add',
          'shared/clean-code',
          '--target',
          'claude',
          '--project-dir',
          dir,
          '--dry-run',
          ...CATALOG_ARGS,
        ],
        dir,
      );

      assert.equal(result.status, 0, `expected exit 0, got ${result.status}: ${result.stdout}`);
      assert.ok(!fs.existsSync(path.join(dir, '.claude')), 'dry-run must not write .claude/');
      assert.match(
        result.stdout,
        /shared-clean-code/,
        "mentions the selected artifact's output file",
      );
    });
  });

  it('add writes files and records a manifest', () => {
    withTempDir(dir => {
      const result = runCli(
        [
          'add',
          'shared/clean-code',
          '--target',
          'claude',
          '--project-dir',
          dir,
          '--yes',
          ...CATALOG_ARGS,
        ],
        dir,
      );

      assert.equal(result.status, 0, `expected exit 0, got ${result.status}: ${result.stdout}`);
      assert.ok(fs.existsSync(path.join(dir, '.claude', 'rules')), '.claude/rules/ written');
      assert.ok(fs.existsSync(path.join(dir, '.sigil', 'manifest.json')), 'manifest written');
    });
  });

  it('add into an already-installed project reports up-to-date, does not error', () => {
    withTempDir(dir => {
      runCli(
        [
          'add',
          'shared/clean-code',
          '--target',
          'claude',
          '--project-dir',
          dir,
          '--yes',
          ...CATALOG_ARGS,
        ],
        dir,
      );
      const second = runCli(
        [
          'add',
          'shared/clean-code',
          '--target',
          'claude',
          '--project-dir',
          dir,
          '--yes',
          ...CATALOG_ARGS,
        ],
        dir,
      );

      assert.equal(second.status, 0, `expected exit 0 on reinstall, got ${second.status}`);
    });
  });
});

describe('characterization — sigil delete', () => {
  it('delete --dry-run on an unknown id exits 1 and lists available ids', () => {
    const result = runCli(
      ['delete', 'nope/does-not-exist', '--dry-run', ...CATALOG_ONLY_ARGS],
      process.cwd(),
    );

    assert.equal(result.status, 1, 'unknown id must exit non-zero');
    assert.match(result.stdout + result.stderr, /not found/i);
  });
});

describe('characterization — sigil status', () => {
  it('status on a project with no manifest reports nothing installed', () => {
    withTempDir(dir => {
      const result = runCli(['status', '--project-dir', dir, ...CATALOG_ARGS], dir);

      assert.equal(result.status, 0, `expected exit 0, got ${result.status}: ${result.stdout}`);
    });
  });

  it('status after install reports the installed artifact as up-to-date', () => {
    withTempDir(dir => {
      runCli(
        [
          'add',
          'shared/clean-code',
          '--target',
          'claude',
          '--project-dir',
          dir,
          '--yes',
          ...CATALOG_ARGS,
        ],
        dir,
      );
      const result = runCli(['status', '--project-dir', dir, ...CATALOG_ARGS], dir);

      assert.equal(result.status, 0, `expected exit 0, got ${result.status}: ${result.stdout}`);
      assert.match(result.stdout, /shared\/clean-code/);
    });
  });
});

describe('characterization — sigil update (config kinds)', () => {
  it('restores a deleted config-kind file (hook/settings) via update', () => {
    withTempDir(dir => {
      runCli(
        [
          'add',
          'shared/protect-config',
          '--target',
          'claude',
          '--project-dir',
          dir,
          '--yes',
          ...CATALOG_ARGS,
        ],
        dir,
      );
      const settingsPath = path.join(dir, '.claude', 'settings.json');
      assert.ok(fs.existsSync(settingsPath), 'precondition: settings.json written by add');

      fs.rmSync(settingsPath);
      const result = runCli(
        ['update', 'shared/protect-config', '--project-dir', dir, ...CATALOG_ARGS],
        dir,
      );

      assert.equal(result.status, 0, `expected exit 0, got ${result.status}: ${result.stdout}`);
      assert.ok(fs.existsSync(settingsPath), 'update must restore the deleted config file');
      assert.match(result.stdout, /restored/);
    });
  });
});

describe('characterization — not-found errors (get / edit)', () => {
  it('get on an unknown id exits 1 and lists available ids', () => {
    const result = runCli(['get', 'nope/does-not-exist', ...CATALOG_ONLY_ARGS], process.cwd());

    assert.equal(result.status, 1, 'unknown id must exit non-zero');
    assert.match(result.stdout + result.stderr, /not found/i);
  });

  it('edit on an unknown id exits 1 and lists available ids', () => {
    const result = runCli(
      ['edit', 'nope/does-not-exist', '--yes', '--title', 'x', ...CATALOG_ONLY_ARGS],
      process.cwd(),
    );

    assert.equal(result.status, 1, 'unknown id must exit non-zero');
    assert.match(result.stdout + result.stderr, /not found/i);
  });
});
