/**
 * Home-scope `.sigil.bak` policy (issue #103): a backup is taken only when the file holds
 * content sigil did not write. A file that holds nothing but sigil's recorded fragments is
 * sigil's own work, so there is nothing of the user's to protect; `uninstall` must not leave a
 * backup behind after it deletes the file it created.
 *
 * The unit cases call the planned two-argument `ensureHomeBackup(fullPath, sigilOps)`. The
 * currently built signature takes one argument, so the two-argument form is reached through a
 * local typed alias: the extra argument is ignored at runtime until the fix lands.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CopilotTarget } from '../../dist-cli/targets/copilot';
import { applyMerge } from '../../dist-cli/config-merge/index';
import { ensureHomeBackup } from '../../dist-cli/config-utils';
import { withTempDir } from '../helpers/temp-dir';
import type { ConfigMergeOp, ResolvedCatalog } from '../../dist-cli/types';

/** The planned signature; see the file header for why the alias exists. */
type EnsureHomeBackupWithOps = (fullPath: string, sigilOps: readonly ConfigMergeOp[]) => void;
const ensureBackupWithOps = ensureHomeBackup as unknown as EnsureHomeBackupWithOps;

const PROJECT_DIR = '/abs/project';

interface FakeHook {
  id: string;
  kind: 'hook';
  filePath: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

/** A hook artifact with the fixture's base frontmatter, plus any per-case overrides. */
function makeHook(overrides: Record<string, unknown> = {}, id = 'shared/test-hook'): FakeHook {
  const frontmatter: Record<string, unknown> = {
    kind: 'hook',
    title: 'Test Hook',
    description: 'Test',
    event: 'PreToolUse',
    matcher: 'Edit|Write',
    command: 'node',
    args: ['-e', 'x'],
    ...overrides,
  };
  // An explicit `undefined` override means "this key is absent", not "set to undefined".
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === undefined) delete frontmatter[key];
  }
  return { id, kind: 'hook', filePath: '/fake/hook.md', frontmatter, body: '' };
}

function makeCatalog(...artifacts: FakeHook[]): ResolvedCatalog {
  return {
    artifacts,
    byId: new Map(artifacts.map(a => [a.id, a])),
    languages: new Map(),
  } as unknown as ResolvedCatalog;
}

const target = new CopilotTarget();

/** One user-scope Copilot hook op — `hooks/sigil.json` under the copilot-home root. */
async function hookOp(
  overrides: Record<string, unknown> = {},
  id = 'shared/test-hook',
): Promise<ConfigMergeOp> {
  const ops = await target.scaffoldConfig(id, makeCatalog(makeHook(overrides, id)), {
    projectDir: PROJECT_DIR,
    scope: 'user',
  });
  return ops[0]!;
}

const hookFile = (dir: string) => path.join(dir, 'hooks', 'sigil.json');
const bakOf = (fullPath: string) => `${fullPath}.sigil.bak`;

/** Writes `content` (an object, or raw text) as the hook file and returns its path. */
function seedHookFile(dir: string, content: Record<string, unknown> | string): string {
  const fullPath = hookFile(dir);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(
    fullPath,
    typeof content === 'string' ? content : JSON.stringify(content, null, 2),
  );
  return fullPath;
}

const assertNoBackup = (fullPath: string, when: string) =>
  assert.equal(fs.existsSync(bakOf(fullPath)), false, `${when} created a .sigil.bak`);

const assertBackupEqualsFile = (fullPath: string) =>
  assert.deepEqual(fs.readFileSync(bakOf(fullPath)), fs.readFileSync(fullPath));

describe('ensureHomeBackup — content-aware backup for home-scoped config files', () => {
  it('does not create a .sigil.bak when the file does not exist yet', async () => {
    const op = await hookOp();
    withTempDir(dir => {
      const fullPath = hookFile(dir);

      ensureBackupWithOps(fullPath, [op]);

      assert.equal(fs.existsSync(fullPath), false);
      assertNoBackup(fullPath, 'a missing file');
    });
  });

  it('does not create a .sigil.bak when the file holds exactly one recorded fragment', async () => {
    const op = await hookOp();
    withTempDir(dir => {
      const fullPath = seedHookFile(dir, applyMerge({}, op));

      ensureBackupWithOps(fullPath, [op]);

      assertNoBackup(fullPath, 'a file holding only sigil entries');
    });
  });

  it('does not create a .sigil.bak when two recorded fragments share the version marker', async () => {
    const opA = await hookOp({ event: 'PreToolUse' }, 'shared/a');
    const opB = await hookOp({ event: 'PostToolUse', args: ['-e', 'b'] }, 'shared/b');
    assert.equal(opA.strategy.version, 'file-marker');
    assert.equal(opB.strategy.version, 'file-marker');
    withTempDir(dir => {
      const fullPath = seedHookFile(dir, applyMerge(applyMerge({}, opA), opB));

      ensureBackupWithOps(fullPath, [opA, opB]);

      assertNoBackup(fullPath, 'a file holding two sigil fragments');
    });
  });

  it('backs up the file byte for byte when it holds a recorded fragment plus a user key', async () => {
    const op = await hookOp();
    withTempDir(dir => {
      const fullPath = seedHookFile(dir, applyMerge({ userSetting: true }, op));

      ensureBackupWithOps(fullPath, [op]);

      assertBackupEqualsFile(fullPath);
    });
  });

  it('backs up the file byte for byte when it is not valid JSON', async () => {
    withTempDir(dir => {
      const fullPath = seedHookFile(dir, 'not json: { oops');

      ensureBackupWithOps(fullPath, []);

      assertBackupEqualsFile(fullPath);
    });
  });

  it('leaves an existing .sigil.bak unchanged', async () => {
    const op = await hookOp();
    withTempDir(dir => {
      const fullPath = seedHookFile(dir, applyMerge({}, op));
      fs.writeFileSync(bakOf(fullPath), 'original backup bytes');

      ensureBackupWithOps(fullPath, [op]);

      assert.equal(fs.readFileSync(bakOf(fullPath), 'utf8'), 'original backup bytes');
    });
  });
});

// ── CLI round trip ─────────────────────────────────────────────────────────────

const CLI = path.resolve(__dirname, '../../dist-cli/cli.js');
const HOOK = 'shared/protect-config';

function run(cwd: string, env: NodeJS.ProcessEnv | undefined, args: string[]): string {
  const options = { cwd, encoding: 'utf-8' as const };
  return execFileSync(process.execPath, [CLI, ...args, '--project-dir', cwd], {
    ...options,
    ...(env ? { env } : {}),
  });
}

function sigilWithEnv(cwd: string, env: NodeJS.ProcessEnv, ...args: string[]): string {
  return run(cwd, env, args);
}

const readJson = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));

const envFor = (home: string): NodeJS.ProcessEnv => ({ ...process.env, COPILOT_HOME: home });

/** `add` needs the scope flag; `update` and `uninstall` follow the manifest. */
function addUserHook(cwd: string, env: NodeJS.ProcessEnv): void {
  sigilWithEnv(cwd, env, 'add', HOOK, '--target', 'copilot', '--scope', 'user', '--yes');
}

function updateUserHook(cwd: string, env: NodeJS.ProcessEnv): void {
  sigilWithEnv(cwd, env, 'update', HOOK, '--target', 'copilot', '--yes');
}

function uninstallUserHook(cwd: string, env: NodeJS.ProcessEnv): void {
  sigilWithEnv(cwd, env, 'uninstall', HOOK, '--target', 'copilot', '--yes');
}

const USER_HOOK_ENTRY = {
  type: 'command',
  matcher: 'Bash',
  command: 'echo user',
};

describe('home-scoped backup — CLI round trip (Copilot user scope)', () => {
  it('empty $COPILOT_HOME: add, update and uninstall leave no .sigil.bak and remove the hook file', () => {
    withTempDir(dir => {
      withTempDir(home => {
        const env = envFor(home);
        const fullPath = hookFile(home);

        addUserHook(dir, env);
        assertNoBackup(fullPath, 'add');

        updateUserHook(dir, env);
        assertNoBackup(fullPath, 'update');

        uninstallUserHook(dir, env);
        assertNoBackup(fullPath, 'uninstall');
        assert.equal(fs.existsSync(fullPath), false, 'the file sigil created is deleted');
      });
    });
  });

  it('pre-existing user hook: add backs up the original bytes and uninstall preserves both', () => {
    withTempDir(dir => {
      withTempDir(home => {
        const env = envFor(home);
        const fullPath = hookFile(home);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        const original = JSON.stringify({
          version: 1,
          hooks: { PreToolUse: [USER_HOOK_ENTRY] },
        });
        fs.writeFileSync(fullPath, original);

        addUserHook(dir, env);
        assert.equal(fs.readFileSync(bakOf(fullPath), 'utf8'), original);

        uninstallUserHook(dir, env);
        assert.deepEqual(readJson(fullPath).hooks.PreToolUse, [USER_HOOK_ENTRY]);
        assert.equal(fs.readFileSync(bakOf(fullPath), 'utf8'), original);
      });
    });
  });

  it('a key the user adds after add is in the backup uninstall takes', () => {
    withTempDir(dir => {
      withTempDir(home => {
        const env = envFor(home);
        const fullPath = hookFile(home);

        addUserHook(dir, env);
        const installed = readJson(fullPath);
        installed.userSetting = true;
        fs.writeFileSync(fullPath, JSON.stringify(installed, null, 2));

        uninstallUserHook(dir, env);

        assert.equal(fs.existsSync(bakOf(fullPath)), true, 'a backup was taken');
        assert.equal(readJson(bakOf(fullPath)).userSetting, true, 'the backup holds the user key');
      });
    });
  });
});
