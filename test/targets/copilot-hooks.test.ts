/**
 * Copilot hook config: the target writes Copilot's flat hook entries into its own hook files
 * (`.github/hooks/sigil.json`, `.github/copilot/settings.local.json`, `$COPILOT_HOME/hooks/
 * sigil.json`) through the same merge machinery as Claude Code's settings hooks.
 *
 * These are the RED tests for the emitter: until `scaffoldConfig` accepts `hook`, every case
 * here fails with "only supports 'mcp' kind".
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CopilotTarget } from '../../dist-cli/targets/copilot';
import { applyMerge, reverseMerge } from '../../dist-cli/config-merge/index';
import { withTempDir } from '../helpers/temp-dir';
import type { ResolvedCatalog } from '../../dist-cli/types';

const CLI = path.resolve(__dirname, '../../dist-cli/cli.js');
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

const scaffold = async (
  target: CopilotTarget,
  artifactId: string,
  catalog: ResolvedCatalog,
  scope: 'project' | 'local' | 'user',
) => target.scaffoldConfig(artifactId, catalog, { projectDir: PROJECT_DIR, scope });

const hookEntries = (fragment: Record<string, unknown>, event: string): unknown[] => {
  const hooks = fragment.hooks as Record<string, unknown> | undefined;
  return (hooks?.[event] as unknown[] | undefined) ?? [];
};

const entryOf = (result: Record<string, unknown>, event: string): Record<string, unknown> => {
  const hooks = result.hooks as Record<string, unknown> | undefined;
  const entries = (hooks?.[event] as unknown[] | undefined) ?? [];
  assert.equal(entries.length, 1, `expected one ${event} entry`);
  return entries[0] as Record<string, unknown>;
};

describe('copilot hook config — scaffoldConfig', () => {
  const target = new CopilotTarget();

  it('project scope: one array-append op on .github/hooks/sigil.json with the flat exec entry', async () => {
    const catalog = makeCatalog(makeHook());
    const ops = await scaffold(target, 'shared/test-hook', catalog, 'project');

    assert.equal(ops.length, 1);
    const op = ops[0]!;
    assert.equal(op.file, '.github/hooks/sigil.json');
    assert.equal(op.root, 'project');
    assert.equal(op.strategy.hooks, 'array-append');
    assert.deepEqual(op.fragment, {
      version: 1,
      hooks: {
        PreToolUse: [{ type: 'command', matcher: 'Edit|Write', exec: 'node', args: ['-e', 'x'] }],
      },
    });
  });

  it('maps frontmatter timeout to timeoutSec, never timeout', async () => {
    const catalog = makeCatalog(makeHook({ timeout: 30 }));
    const ops = await scaffold(target, 'shared/test-hook', catalog, 'project');

    const entry = entryOf(ops[0]!.fragment, 'PreToolUse');
    assert.equal(entry.timeoutSec, 30);
    assert.ok(!('timeout' in entry), 'Copilot spells it timeoutSec');
  });

  it('shell form (no args) emits type, matcher and command only', async () => {
    const catalog = makeCatalog(makeHook({ command: 'echo hi', args: undefined }));
    const ops = await scaffold(target, 'shared/test-hook', catalog, 'project');

    assert.deepEqual(hookEntries(ops[0]!.fragment, 'PreToolUse'), [
      { type: 'command', matcher: 'Edit|Write', command: 'echo hi' },
    ]);
  });

  it('local scope: .github/copilot/settings.local.json, project root, no version key', async () => {
    const catalog = makeCatalog(makeHook());
    const ops = await scaffold(target, 'shared/test-hook', catalog, 'local');

    const op = ops[0]!;
    assert.equal(op.file, '.github/copilot/settings.local.json');
    assert.equal(op.root, 'project');
    assert.ok(!('version' in op.fragment), 'local settings carry no version');
    assert.equal(hookEntries(op.fragment, 'PreToolUse').length, 1);
  });

  it('user scope: hooks/sigil.json under the copilot-home root', async () => {
    const catalog = makeCatalog(makeHook());
    const ops = await scaffold(target, 'shared/test-hook', catalog, 'user');

    assert.equal(ops[0]!.file, 'hooks/sigil.json');
    assert.equal(ops[0]!.root, 'copilot-home');
  });

  for (const event of ['Stop', 'SubagentStop', 'Notification']) {
    it(`refuses event ${event} with an error naming it and Copilot`, async () => {
      const catalog = makeCatalog(makeHook({ event }));

      await assert.rejects(
        () => scaffold(target, 'shared/test-hook', catalog, 'project'),
        (err: Error) => {
          assert.match(err.message, new RegExp(event));
          assert.match(err.message, /Copilot/);
          return true;
        },
      );
    });
  }
});

describe('copilot hook config — two hooks share version', () => {
  it('keeps version 1 while another hook remains, then clears the event on the last uninstall', async () => {
    const target = new CopilotTarget();
    const catalog = makeCatalog(
      makeHook({ command: 'a' }, 'shared/a'),
      makeHook({ command: 'b' }, 'shared/b'),
    );
    const [opA] = await scaffold(target, 'shared/a', catalog, 'project');
    const [opB] = await scaffold(target, 'shared/b', catalog, 'project');

    const installed = applyMerge(applyMerge({}, opA!), opB!);

    const afterA = reverseMerge(installed, opA!);
    assert.equal(afterA.version, 1, 'version survives while a second hook remains');
    assert.deepEqual(hookEntries(afterA, 'PreToolUse'), [
      { type: 'command', matcher: 'Edit|Write', exec: 'b', args: ['-e', 'x'] },
    ]);

    const afterB = reverseMerge(afterA, opB!);
    assert.ok(!('version' in afterB), 'version dropped once no sigil hook is left');
    assert.equal(hookEntries(afterB, 'PreToolUse').length, 0);
  });

  it('keeps a version the user changed when the last hook is uninstalled', async () => {
    const target = new CopilotTarget();
    const catalog = makeCatalog(makeHook());
    const [op] = await scaffold(target, 'shared/test-hook', catalog, 'project');

    const edited = { ...applyMerge({}, op!), version: 2 };

    const after = reverseMerge(edited, op!);
    assert.deepEqual(after, { version: 2 }, 'a version sigil did not write is never removed');
  });
});

describe('copilot hook config — scope labels', () => {
  const localOf = (kinds: ('mcp' | 'hook')[]) =>
    new CopilotTarget().configScopes(kinds, '/proj').find(sc => sc.value === 'local');

  it('hook-only Local says not git-committed and names only the settings file', () => {
    const local = localOf(['hook']);
    assert.ok(local);
    assert.match(local.description, /settings\.local\.json, not git-committed/);
    assert.doesNotMatch(local.description, /\.mcp\.json/);
  });

  it('mcp + hook Local says the mcp part still goes to the committed .mcp.json', () => {
    const local = localOf(['mcp', 'hook']);
    assert.ok(local);
    assert.match(local.description, /settings\.local\.json \(not git-committed\)/);
    assert.match(local.description, /git-committed \.mcp\.json/);
    assert.deepEqual(
      local.destinations.map(d => [d.kind, d.file]),
      [
        ['mcp', '.mcp.json'],
        ['hook', '.github/copilot/settings.local.json'],
      ],
    );
  });
});

// ── CLI round trip ─────────────────────────────────────────────────────────────

const HOOK = 'shared/protect-config';

function run(cwd: string, env: NodeJS.ProcessEnv | undefined, args: string[]): string {
  const options = { cwd, encoding: 'utf-8' as const };
  return execFileSync(process.execPath, [CLI, ...args, '--project-dir', cwd], {
    ...options,
    ...(env ? { env } : {}),
  });
}

function sigil(cwd: string, ...args: string[]): string {
  return run(cwd, undefined, args);
}

function sigilWithEnv(cwd: string, env: NodeJS.ProcessEnv, ...args: string[]): string {
  return run(cwd, env, args);
}

const readJson = (dir: string, file: string) =>
  JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));

describe('copilot hooks — CLI round trip', () => {
  it('project scope: add writes one entry, update keeps one, uninstall clears it', () => {
    withTempDir(dir => {
      sigil(dir, 'add', HOOK, '--target', 'copilot', '--scope', 'project', '--yes');
      const installed = readJson(dir, '.github/hooks/sigil.json');
      assert.equal(installed.version, 1);
      const added = installed.hooks.PreToolUse;
      assert.equal(added.length, 1);
      assert.equal(added[0].exec, 'node');
      assert.equal(added[0].matcher, 'Edit|Write');
      assert.equal(fs.existsSync(path.join(dir, '.claude/settings.json')), false);

      sigil(dir, 'update', HOOK, '--target', 'copilot', '--yes');
      assert.equal(readJson(dir, '.github/hooks/sigil.json').hooks.PreToolUse.length, 1);

      sigil(dir, 'uninstall', HOOK, '--target', 'copilot', '--yes');
      const file = path.join(dir, '.github/hooks/sigil.json');
      if (fs.existsSync(file)) {
        const left = readJson(dir, '.github/hooks/sigil.json').hooks?.PreToolUse ?? [];
        assert.equal(left.length, 0);
      }
    });
  });

  it('user scope honors $COPILOT_HOME and leaves the project .github/hooks alone', () => {
    withTempDir(dir => {
      withTempDir(home => {
        const env = { ...process.env, COPILOT_HOME: home };
        sigilWithEnv(dir, env, 'add', HOOK, '--target', 'copilot', '--scope', 'user', '--yes');

        const installed = readJson(home, 'hooks/sigil.json');
        assert.equal(installed.hooks.PreToolUse.length, 1);
        assert.equal(fs.existsSync(path.join(dir, '.github/hooks/sigil.json')), false);
      });
    });
  });
});
