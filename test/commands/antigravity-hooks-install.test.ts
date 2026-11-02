/**
 * Antigravity hook install round trip: `add` merges the named entry into
 * `.agents/hooks.json` (project) or `~/.gemini/config/hooks.json` (user) without touching a user's
 * other hooks, a second `add` does not stack a second entry, `uninstall` reverses only sigil's
 * fragment, a home-scoped write takes one `.sigil.bak`, and `status` / `update` classify a
 * hand-edited command as modified and a deleted key as restorable (docs/plan-antigravity-target-e.md
 * step 5; F14 / F23 in docs/decisions/catalog-usage-audit-2026-08-21.md).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runAdd } from '../../dist-cli/commands/add';
import type { AddOpts } from '../../dist-cli/commands/add';
import { runStatus } from '../../dist-cli/commands/status';
import { runUninstall } from '../../dist-cli/commands/uninstall';
import { runUpdate } from '../../dist-cli/commands/update';
import type { UpdateOptions } from '../../dist-cli/commands/update';
import { loadManifest } from '../../dist-cli/manifest';
import { makeTeamCatalog } from '../helpers/team-catalog';
import type { TeamCatalog } from '../helpers/team-catalog';
import { withTempDirAsync } from '../helpers/temp-dir';

const HOOK = 'shared/protect-config';
const TARGET = 'antigravity';
const HOME_VAR = process.platform === 'win32' ? 'USERPROFILE' : 'HOME';

/** One row of `sigil status --json`. */
interface StatusRow {
  id: string;
  target: string;
  status: string;
  driftedFiles: string[];
  reason?: string;
}

interface Fixture {
  project: string;
  home: string;
  catalog: TeamCatalog;
}

/** A temp root's project dir, a separate temp home, and the team catalog. */
function makeFixture(root: string): Fixture {
  const project = path.join(root, 'project');
  const home = path.join(root, 'home');
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  return { project, home, catalog: makeTeamCatalog(root) };
}

/** Runs `fn` with the home directory redirected at `home`, restoring it afterwards. */
async function withHome<T>(home: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.env[HOME_VAR];
  process.env[HOME_VAR] = home;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env[HOME_VAR];
    else process.env[HOME_VAR] = previous;
  }
}

function addOpts(
  fixture: Fixture,
  scope: 'project' | 'user',
  overrides: Partial<AddOpts> = {},
): AddOpts {
  return {
    projectDir: fixture.project,
    catalogDir: fixture.catalog.dir,
    packs: fixture.catalog.packs,
    target: TARGET,
    scope,
    deps: true,
    dryRun: false,
    interactive: false,
    yes: true,
    overwrite: false,
    settingsLocal: false,
    ...overrides,
  };
}

function updateOpts(fixture: Fixture, force: boolean): UpdateOptions {
  return {
    projectDir: fixture.project,
    catalogDir: fixture.catalog.dir,
    packs: fixture.catalog.packs,
    target: TARGET,
    force,
    dryRun: false,
    yes: true,
  };
}

function statusOpts(fixture: Fixture) {
  return {
    projectDir: fixture.project,
    catalogDir: fixture.catalog.dir,
    packs: fixture.catalog.packs,
    target: TARGET,
    json: true,
  };
}

/** Runs `fn` with console output captured, returning every printed line. */
async function captureText(fn: () => Promise<void>): Promise<string> {
  const original = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => lines.push(args.join(' '));
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return lines.join('\n');
}

/** Runs `fn` and parses its `--json` output. */
async function captureJson<T>(fn: () => Promise<void>): Promise<T> {
  return JSON.parse(await captureText(fn)) as T;
}

const projectHooksFile = (fixture: Fixture) => path.join(fixture.project, '.agents/hooks.json');
const userHooksFile = (fixture: Fixture) => path.join(fixture.home, '.gemini/config/hooks.json');

/** A user-owned hook Antigravity must keep through add, a second add and uninstall. */
const USER_HOOK = {
  matcher: 'run_command',
  hooks: [{ type: 'command', command: 'echo mine' }],
};

const readJson = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));

/** Seeds a hooks file with the user's own hook and returns its original bytes. */
function seedUserHook(file: string): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const original = JSON.stringify({ mine: USER_HOOK }, null, 2);
  fs.writeFileSync(file, original);
  return original;
}

/** The one `PreToolUse` handler sigil installed for `HOOK`. */
function installedHandler(file: string): { type: string; command: string } {
  const fragment = readJson(file)[HOOK.replaceAll('/', '-')];
  assert.equal(fragment.PreToolUse.length, 1, 'one PreToolUse entry');
  return fragment.PreToolUse[0].hooks[0];
}

describe('antigravity hook install — project scope', () => {
  it('preserves a user hook and records the fragment in the manifest', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);
      const file = projectHooksFile(fixture);
      seedUserHook(file);

      await withHome(fixture.home, () => runAdd([HOOK], addOpts(fixture, 'project')));

      const after = readJson(file);
      assert.deepEqual(after.mine, USER_HOOK, "the user's hook is unchanged");
      assert.ok(after['shared-protect-config'], 'sigil entered its hook by artifact name');

      const entry = loadManifest(fixture.project).entries.find(
        e => e.id === HOOK && e.target === TARGET,
      );
      assert.ok(entry, 'the manifest records the hook');
      const recorded = entry.configFiles?.[0];
      assert.ok(recorded, 'the manifest records the config fragment');
      assert.equal(recorded.file, '.agents/hooks.json');
      assert.deepEqual(
        recorded.fragment,
        { 'shared-protect-config': after['shared-protect-config'] },
        'the recorded fragment is what the file holds',
      );
    });
  });

  it('does not stack a second entry when the hook is added again', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);
      const file = projectHooksFile(fixture);
      seedUserHook(file);

      await withHome(fixture.home, async () => {
        await runAdd([HOOK], addOpts(fixture, 'project'));
        const first = installedHandler(file);
        await runAdd([HOOK], addOpts(fixture, 'project'));
        assert.deepEqual(installedHandler(file), first, 'one PreToolUse entry, unchanged');
      });
      assert.deepEqual(readJson(file).mine, USER_HOOK, "the user's hook is still there");
    });
  });

  it('leaves only the user hook after uninstall', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);
      const file = projectHooksFile(fixture);
      seedUserHook(file);

      await withHome(fixture.home, async () => {
        await runAdd([HOOK], addOpts(fixture, 'project'));
        await runUninstall([HOOK], {
          projectDir: fixture.project,
          target: TARGET,
          yes: true,
          force: false,
          dryRun: false,
        });
      });

      assert.deepEqual(readJson(file), { mine: USER_HOOK });
    });
  });
});

describe('antigravity hook install — user scope', () => {
  it('backs up a pre-existing hooks.json once, byte for byte', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);
      const file = userHooksFile(fixture);
      const original = seedUserHook(file);

      await withHome(fixture.home, () => runAdd([HOOK], addOpts(fixture, 'user')));

      const backup = `${file}.sigil.bak`;
      assert.equal(
        fs.readFileSync(backup, 'utf8'),
        original,
        'the backup holds the original bytes',
      );
      assert.deepEqual(
        fs.readdirSync(path.dirname(file)).filter(name => name.endsWith('.sigil.bak')),
        ['hooks.json.sigil.bak'],
        'one backup',
      );
      const after = readJson(file);
      assert.deepEqual(after.mine, USER_HOOK, "the user's hook is unchanged");
      assert.ok(after['shared-protect-config'], 'sigil wrote its hook at user scope');
    });
  });
});

describe('antigravity hook install — status and update', () => {
  it('reports a hand-edited command as modified and update refuses without --force', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);
      const file = projectHooksFile(fixture);
      seedUserHook(file);

      await withHome(fixture.home, async () => {
        await runAdd([HOOK], addOpts(fixture, 'project'));

        const edited = readJson(file);
        edited['shared-protect-config'].PreToolUse[0].hooks[0].command = 'echo tampered';
        fs.writeFileSync(file, JSON.stringify(edited, null, 2));

        const rows = await captureJson<StatusRow[]>(() => runStatus(statusOpts(fixture)));
        const row = rows.find(r => r.id === HOOK && r.target === TARGET);
        assert.ok(row, 'status lists the installed hook');
        assert.equal(row.status, 'drifted');
        assert.match(row.driftedFiles.join('\n'), /values changed/);

        const output = await captureText(() => runUpdate([], updateOpts(fixture, false)));
        assert.match(output, /would skip without --force/);
        assert.equal(
          installedHandler(file).command,
          'echo tampered',
          "update kept the user's edit",
        );
      });
    });
  });

  it('restores a deleted key without --force and keeps the user hook', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);
      const file = projectHooksFile(fixture);
      seedUserHook(file);

      await withHome(fixture.home, async () => {
        await runAdd([HOOK], addOpts(fixture, 'project'));
        const installed = installedHandler(file);

        const deleted = readJson(file);
        delete deleted['shared-protect-config'];
        fs.writeFileSync(file, JSON.stringify(deleted, null, 2));

        await runUpdate([], updateOpts(fixture, false));

        assert.deepEqual(installedHandler(file), installed, 'the catalog entry is restored');
        assert.deepEqual(readJson(file).mine, USER_HOOK, "the user's hook is untouched");
      });
    });
  });
});
