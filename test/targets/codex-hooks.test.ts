/**
 * Codex hook config: the target writes Codex's hook groups into its own hook files
 * (`.codex/hooks.json` project, `$CODEX_HOME/hooks.json` user) through the same merge machinery as
 * Claude Code's settings hooks and Copilot's hook files.
 *
 * These are the RED tests for the emitter: until `scaffoldConfig` accepts `hook`, every case here
 * fails with "Codex scaffoldConfig only supports the 'hook' kind" (or a missing scaffoldConfig).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CodexTarget } from '../../dist-cli/targets/codex';
import {
  buildCodexHookOps,
  hookFragment,
  posixCommandLine,
  windowsCommandLine,
} from '../../dist-cli/targets/codex/hook-ops';
import { loadResolvedCatalog } from '../helpers/catalog';
import { withTempDir } from '../helpers/temp-dir';
import type { Artifact, ConfigMergeOp, ResolvedCatalog } from '../../dist-cli/types';

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
  target: CodexTarget,
  artifactId: string,
  catalog: ResolvedCatalog,
  scope: 'project' | 'local' | 'user',
) => target.scaffoldConfig!(artifactId, catalog, { projectDir: PROJECT_DIR, scope });

interface HookGroup {
  matcher: string;
  hooks: Record<string, unknown>[];
}

/** The first PreToolUse group and its single entry from one op. */
function hookGroup(op: ConfigMergeOp): { group: HookGroup; entry: Record<string, unknown> } {
  const groups = (op.fragment.hooks as Record<string, HookGroup[]>).PreToolUse!;
  assert.equal(groups.length, 1, 'expected one PreToolUse group');
  const group = groups[0]!;
  assert.equal(group.hooks.length, 1, 'expected one entry in the group');
  return { group, entry: group.hooks[0]! };
}

describe('codex hook config — scaffoldConfig', () => {
  const target = new CodexTarget();

  it('project scope: one array-append op on .codex/hooks.json with matcher and no args key', async () => {
    const catalog = await loadResolvedCatalog();
    const ops = await scaffold(target, 'shared/protect-config', catalog, 'project');

    assert.equal(ops.length, 1);
    const op = ops[0]!;
    assert.equal(op.file, '.codex/hooks.json');
    assert.equal(op.root, 'project');
    assert.equal(op.strategy.hooks, 'array-append');
    const { group, entry } = hookGroup(op);
    assert.equal(group.matcher, 'Edit|Write');
    assert.equal(entry.type, 'command');
    assert.ok(!('args' in entry), 'Codex carries the joined command line, not an args array');
    assert.equal(typeof entry.command, 'string');
    assert.equal(entry.commandWindows, undefined, 'one string runs in every shell');
    assert.doesNotMatch(entry.command as string, /[$`\\!\n]/);
  });

  it('user scope: hooks.json under the codex-home root', async () => {
    const catalog = makeCatalog(makeHook());
    const ops = await scaffold(target, 'shared/test-hook', catalog, 'user');

    assert.equal(ops[0]!.file, 'hooks.json');
    assert.equal(ops[0]!.root, 'codex-home');
  });

  it('user scope resolves under $CODEX_HOME when set', () => {
    const prev = process.env.CODEX_HOME;
    process.env.CODEX_HOME = '/tmp/codex-home-test';
    try {
      const user = target.configScopes!(['hook'], PROJECT_DIR).find(sc => sc.value === 'user');
      assert.ok(user, 'user scope offered');
      assert.equal(
        user.destinations[0]!.fullPath,
        path.resolve('/tmp/codex-home-test', 'hooks.json'),
      );
    } finally {
      if (prev === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = prev;
    }
  });

  it('local scope throws, naming project and user', async () => {
    const catalog = makeCatalog(makeHook());
    await assert.rejects(
      () => scaffold(target, 'shared/test-hook', catalog, 'local'),
      (err: Error) => {
        assert.match(err.message, /project/);
        assert.match(err.message, /user/);
        return true;
      },
    );
  });

  it('refuses an event Codex does not document', async () => {
    const catalog = makeCatalog(makeHook({ event: 'Notification' }));
    await assert.rejects(
      () => scaffold(target, 'shared/test-hook', catalog, 'project'),
      (err: Error) => {
        assert.match(err.message, /Notification/);
        assert.match(err.message, /Codex/);
        return true;
      },
    );
  });
});

// ── command-line builders ─────────────────────────────────────────────────────

describe('codex hook command-line builders', () => {
  it('posixCommandLine single-quotes only what needs it', () => {
    assert.equal(posixCommandLine('x', ["it's", 'a b']), `x 'it'\\''s' 'a b'`);
  });

  it('posixCommandLine returns command as written when there are no args', () => {
    assert.equal(posixCommandLine('echo hi', undefined), 'echo hi');
  });

  it('windowsCommandLine refuses an arg cmd.exe cannot express', () => {
    assert.throws(
      () => windowsCommandLine('echo', ['a"b']),
      (err: Error) => {
        assert.match(err.message, /cmd\.exe/);
        return true;
      },
    );
  });

  it('buildCodexHookOps surfaces the cmd.exe refusal for a non-node command', () => {
    const artifact = makeHook({ command: 'echo', args: ['a"b'] }) as unknown as Artifact;
    assert.throws(
      () => buildCodexHookOps(artifact, 'project'),
      (err: Error) => {
        assert.match(err.message, /cmd\.exe/);
        return true;
      },
    );
  });

  it('windowsCommandLine is undefined without args, so Codex uses command', () => {
    assert.equal(windowsCommandLine('echo hi', undefined), undefined);
  });
});

// ── command strings run under sh -c ───────────────────────────────────────────

const codexPatch = (...lines: string[]): string =>
  JSON.stringify({
    tool_name: 'apply_patch',
    tool_input: { command: ['*** Begin Patch', ...lines, '*** End Patch', ''].join('\n') },
  });

/** Runs a hook command string through `sh -c`, with the test's own node first on PATH. */
function runCommandLine(
  commandLine: string,
  stdin: string,
): { status: number | null; stderr: string } {
  const nodeDir = path.dirname(process.execPath);
  const env = { ...process.env, PATH: `${nodeDir}${path.delimiter}${process.env.PATH ?? ''}` };
  const r = spawnSync('sh', ['-c', commandLine], { input: stdin, encoding: 'utf8', env });
  return { status: r.status, stderr: r.stderr };
}

describe(
  'codex hook command strings run under sh -c',
  { skip: process.platform === 'win32' },
  () => {
    async function protectConfigEntry(): Promise<Record<string, unknown>> {
      const ops = await new CodexTarget().scaffoldConfig!(
        'shared/protect-config',
        await loadResolvedCatalog(),
        { projectDir: PROJECT_DIR, scope: 'project' },
      );
      return hookGroup(ops[0]!).entry;
    }

    for (const [label, input, status] of [
      ['a .env patch', codexPatch('*** Add File: .env', '+X=1'), 2],
      ['an a.ts patch', codexPatch('*** Add File: src/a.ts', '+x'), 0],
    ] as const) {
      it(`command ${status === 2 ? 'blocks' : 'allows'} ${label}`, async () => {
        const entry = await protectConfigEntry();
        const r = runCommandLine(entry.command as string, input);
        assert.equal(r.status, status, r.stderr);
      });
    }
  },
);

// ── CLI round trip ────────────────────────────────────────────────────────────

const HOOK = 'shared/protect-config';

function sigil(cwd: string, ...args: string[]): string {
  return execFileSync(process.execPath, [CLI, ...args, '--project-dir', cwd], {
    cwd,
    encoding: 'utf8',
  });
}

const readJson = (dir: string, file: string) =>
  JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));

describe('codex hooks — CLI round trip', () => {
  it('re-add keeps one sigil entry and uninstall leaves a user hook', () => {
    withTempDir(dir => {
      const file = path.join(dir, '.codex/hooks.json');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(
        file,
        JSON.stringify({
          hooks: {
            PreToolUse: [
              { matcher: 'Edit', hooks: [{ type: 'command', command: 'echo user-hook' }] },
            ],
          },
        }),
      );

      sigil(dir, 'add', HOOK, '--target', 'codex', '--scope', 'project', '--yes');
      sigil(dir, 'add', HOOK, '--target', 'codex', '--scope', 'project', '--yes');

      const installed = readJson(dir, '.codex/hooks.json');
      const groups = installed.hooks.PreToolUse as { matcher: string }[];
      assert.equal(
        groups.filter(g => g.matcher === 'Edit|Write').length,
        1,
        'exactly one sigil entry after a re-add',
      );
      assert.equal(groups.length, 2, 'the user hook plus the one sigil entry');

      sigil(dir, 'uninstall', HOOK, '--target', 'codex', '--yes');

      const left = readJson(dir, '.codex/hooks.json').hooks.PreToolUse as {
        matcher: string;
        hooks: { command: string }[];
      }[];
      assert.equal(left.length, 1, 'only the user hook remains');
      assert.equal(left[0]!.matcher, 'Edit');
      assert.equal(left[0]!.hooks[0]!.command, 'echo user-hook');
    });
  });
});

// ── The neutral hook contract ──────────────────────────────────────────────────

/** A fixture script hook: deny any call that names a `.env` file. */
const DENY_ENV_SCRIPT = [
  "const hit = input && input.files.find(file => file.split('/').pop().startsWith('.env'));",
  'if (hit) {',
  "  process.stderr.write('sigil-test: blocked ' + hit + '\\n');",
  '  process.exitCode = 2;',
  '}',
].join('\n');

describe('codex hook contract', () => {
  it('should render a neutral script hook as one base64 node -e command', () => {
    const { event, group } = hookFragment({
      event: 'before-tool',
      matcher: 'edit',
      script: 'return;',
    });

    assert.equal(event, 'PreToolUse', 'the neutral event becomes PreToolUse');
    assert.equal(group.matcher, 'Edit|Write');
    const hooks = group.hooks as Record<string, unknown>[];
    const command = hooks[0]!.command as string;
    assert.match(command, /^node -e "eval\(Buffer\.from\('/);
    assert.ok(!('commandWindows' in hooks[0]!), 'the one line runs in every shell');

    const encoded = /Buffer\.from\('([^']+)'/.exec(command)?.[1];
    assert.ok(encoded, 'the composed source is base64-encoded');
    const source = Buffer.from(encoded, 'base64').toString('utf8');
    assert.match(source, /normalizeHookInput/);
    assert.match(source, /"before-tool"/);
  });

  it('should keep a legacy command hook’s event and matcher', () => {
    const { event, group } = hookFragment({
      event: 'PreToolUse',
      matcher: 'Edit|Write',
      command: 'echo hi',
    });

    assert.equal(event, 'PreToolUse');
    assert.equal(group.matcher, 'Edit|Write');
    assert.deepEqual(group.hooks, [{ type: 'command', command: 'echo hi' }]);
  });

  it('should refuse notification with a message naming it', () => {
    assert.throws(
      () => hookFragment({ event: 'notification', matcher: '*', script: 'return;' }),
      (err: Error) => {
        assert.match(err.message, /notification/);
        assert.match(err.message, /Codex/);
        assert.match(err.message, /before-tool/);
        return true;
      },
    );
  });

  it('should refuse a matcher naming a tool Codex cannot write', () => {
    assert.throws(
      () => hookFragment({ event: 'before-tool', matcher: 'read', script: 'return;' }),
      (err: Error) => {
        assert.match(err.message, /read/);
        assert.match(err.message, /Codex/);
        return true;
      },
    );
  });

  it('should deny an A4 apply_patch touching .env with exit 2', () => {
    const { group } = hookFragment({
      event: 'before-tool',
      matcher: 'edit',
      script: DENY_ENV_SCRIPT,
    });
    const hooks = group.hooks as Record<string, unknown>[];
    const command = hooks[0]!.command as string;

    const result = runCommandLine(command, codexPatch('*** Add File: .env', '+X=1'));
    assert.equal(result.status, 2, result.stderr);
  });
});
