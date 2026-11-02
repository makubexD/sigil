/**
 * `shared/protect-config` end to end: the hook entry sigil writes is spawned exactly the way the
 * agent that runs it does, with that agent's own stdin shape. Claude Code and Copilot get the
 * exec form (`command`/`exec` + `args`, no shell — code.claude.com/docs/en/hooks "Exec form and
 * shell form"); Codex and Cursor get their one-line `node -e` command run through `sh -c`. Each
 * payload is the shape that target really sends (docs/decisions/neutral-hook-contract-2026-11.md):
 * Claude and Cursor `tool_input.file_path`, Copilot a raw patch string, Codex `apply_patch`'s
 * `tool_input.command`. The 2026-09-27 install audit found the previous version read a
 * non-existent `CLAUDE_TOOL_INPUT` env var and never blocked.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ClaudeCodeTarget } from '../../dist-cli/targets/claude-code';
import { CopilotTarget } from '../../dist-cli/targets/copilot';
import { CodexTarget } from '../../dist-cli/targets/codex';
import { CursorTarget } from '../../dist-cli/targets/cursor';
import { loadResolvedCatalog } from '../helpers/catalog';
import type { Target } from '../../dist-cli/types';

const ARTIFACT = 'shared/protect-config';

type TargetName = 'claude' | 'copilot' | 'codex' | 'cursor';

/** The four targets that install this hook, with the matcher each writes for neutral `edit`. */
const TARGETS: readonly { name: TargetName; target: Target; matcher: string }[] = [
  { name: 'claude', target: new ClaudeCodeTarget(), matcher: 'Edit|Write|NotebookEdit' },
  { name: 'copilot', target: new CopilotTarget(), matcher: 'Edit|Write' },
  { name: 'codex', target: new CodexTarget(), matcher: 'Edit|Write' },
  { name: 'cursor', target: new CursorTarget(), matcher: 'Write|Delete' },
];

interface HookEntry {
  type?: string;
  command?: string;
  exec?: string;
  args?: string[];
  matcher?: string;
}

interface HookGroup {
  matcher: string;
  hooks: HookEntry[];
}

interface InstalledHook {
  matcher: string;
  run: (stdin: string) => { status: number | null; stderr: string };
}

/** Runs an exec-form entry, with this test's own node in place of the literal `node`. */
function runExec(
  command: string,
  args: string[] | undefined,
  stdin: string,
): { status: number | null; stderr: string } {
  assert.ok(args, 'exec form: args must be set so no shell touches the exit code');
  const r = spawnSync(command === 'node' ? process.execPath : command, args, {
    input: stdin,
    encoding: 'utf8',
  });
  return { status: r.status, stderr: r.stderr };
}

/** Runs a Codex/Cursor command line through `sh -c`, with this test's own node first on PATH. */
function runCommandLine(commandLine: string, stdin: string): { status: number | null; stderr: string } {
  const nodeDir = path.dirname(process.execPath);
  const env = { ...process.env, PATH: `${nodeDir}${path.delimiter}${process.env.PATH ?? ''}` };
  const r = spawnSync('sh', ['-c', commandLine], { input: stdin, encoding: 'utf8', env });
  return { status: r.status, stderr: r.stderr };
}

/** Installs the hook for one target and returns the entry exactly as that agent spawns it. */
async function install(name: TargetName): Promise<InstalledHook> {
  const { target } = TARGETS.find(t => t.name === name)!;
  const ops = await target.scaffoldConfig!(ARTIFACT, await loadResolvedCatalog(), {
    projectDir: '/fake',
    overwrite: false,
    scope: 'project',
  });
  assert.equal(ops.length, 1, 'one op per hook install');
  const fragment = ops[0]!.fragment;
  switch (name) {
    case 'claude': {
      const group = (fragment.hooks as Record<string, HookGroup[]>).PreToolUse![0]!;
      const entry = group.hooks[0]!;
      return { matcher: group.matcher, run: stdin => runExec(entry.command!, entry.args, stdin) };
    }
    case 'copilot': {
      const entry = (fragment.hooks as Record<string, HookEntry[]>).PreToolUse![0]!;
      return { matcher: entry.matcher!, run: stdin => runExec(entry.exec!, entry.args, stdin) };
    }
    case 'codex': {
      const group = (fragment.hooks as Record<string, HookGroup[]>).PreToolUse![0]!;
      const entry = group.hooks[0]!;
      return { matcher: group.matcher, run: stdin => runCommandLine(entry.command!, stdin) };
    }
    case 'cursor': {
      const entry = (fragment.hooks as Record<string, HookEntry[]>).preToolUse![0]!;
      return { matcher: entry.matcher!, run: stdin => runCommandLine(entry.command!, stdin) };
    }
  }
}

const installed = new Map<TargetName, Promise<InstalledHook>>();

/** The hook installed once per target, reused by every case that feeds that target. */
function hook(name: TargetName): Promise<InstalledHook> {
  let pending = installed.get(name);
  if (pending === undefined) {
    pending = install(name);
    installed.set(name, pending);
  }
  return pending;
}

const patchText = (...lines: string[]) =>
  ['*** Begin Patch', ...lines, '*** End Patch', ''].join('\n');

const addPatch = (filePath: string) => patchText(`*** Add File: ${filePath}`, '+x');

/** One file-path write in the stdin shape `name` really sends. */
function writePayload(name: TargetName, filePath: string): string {
  switch (name) {
    case 'claude':
    case 'cursor':
      return JSON.stringify({ tool_name: 'Write', tool_input: { file_path: filePath } });
    case 'copilot':
      // Copilot sends an edit tool's arguments as one raw patch string.
      return JSON.stringify({ tool_name: 'Edit', tool_input: addPatch(filePath) });
    case 'codex':
      // Codex sends the raw patch in apply_patch's tool_input.command (probe A4).
      return JSON.stringify({ tool_name: 'apply_patch', tool_input: { command: addPatch(filePath) } });
  }
}

const BLOCKED_PATHS = [
  'C:\\repo\\.env',
  '/repo/.env.local',
  '/repo/.ENV.Production',
  '/repo/.envrc',
  '/home/u/.ssh/id_rsa',
  '/home/u/.ssh/id_ed25519',
  '/repo/certs/server.pem',
  '/repo/tls.key',
  '/repo/secrets.json',
  '/repo/config/credentials.yaml',
  '/home/u/.aws/credentials',
  '/home/u/.git-credentials',
  '/repo/store.p12',
  'C:\\repo\\.env::$DATA',
  'C:new.pem',
  '/repo/prod.env',
  '/repo/.env-local',
  '/home/u/.netrc',
  '/home/u/.pgpass',
  '/repo/deploy.ppk',
  '/repo/release.jks',
  '/repo/app.keystore',
];

const ALLOWED_PATHS = [
  '/repo/src/app.ts',
  '/repo/src/environment.ts',
  '/repo/.env.example',
  '/repo/.env.production.example',
  '/repo/.env.local.sample',
  '/home/u/.ssh/id_rsa.pub',
  '/repo/src/secrets.service.ts',
  '/repo/docs/credentials.md',
  '/repo/keys.ts',
];

describe('shared/protect-config hook', () => {
  for (const { name, matcher } of TARGETS) {
    it(`matches ${matcher} on ${name}`, async () => {
      assert.equal((await hook(name)).matcher, matcher);
    });
  }

  for (const { name } of TARGETS) {
    describe(`installed for ${name}`, () => {
      for (const p of BLOCKED_PATHS) {
        it(`blocks ${p}`, async () => {
          const r = (await hook(name)).run(writePayload(name, p));
          assert.equal(r.status, 2, r.stderr);
          assert.match(r.stderr, /sigil-hook: blocked/);
        });
      }

      for (const p of ALLOWED_PATHS) {
        it(`allows ${p}`, async () => {
          assert.equal((await hook(name)).run(writePayload(name, p)).status, 0);
        });
      }
    });
  }

  it('fails open on input it cannot read', async () => {
    const { run } = await hook('claude');
    for (const stdin of ['', 'not json', '{"tool_input":null}', '{"tool_input":{"file_path":7}}']) {
      assert.equal(run(stdin).status, 0, stdin);
    }
  });

  // Claude documents `path` as a file field beside `file_path` (claude-code/hook-dialect.ts).
  for (const [input, status] of [
    [{ path: '.env' }, 2],
    [{ path: 'src/a.ts' }, 0],
    [{}, 0],
  ] as const) {
    it(`${status === 2 ? 'blocks' : 'allows'} tool_input ${JSON.stringify(input)}`, async () => {
      const r = (await hook('claude')).run(
        JSON.stringify({ tool_name: 'Write', tool_input: input }),
      );
      assert.equal(r.status, status, r.stderr);
    });
  }

  // Copilot's apply_patch reports as tool_name Edit with the raw patch as a string tool_input
  // (logged from Copilot CLI 1.0.105, docs/decisions/copilot-plugin-channel-2026-10.md).
  const patch = (...lines: string[]) =>
    JSON.stringify({
      tool_name: 'Edit',
      tool_input: ['*** Begin Patch', ...lines, '*** End Patch', ''].join('\n'),
    });

  for (const [name, stdin, status] of [
    ['an added .env', patch('*** Add File: .env', '+KEY=1'), 2],
    ['an updated secret by absolute path', patch('*** Update File: /repo/.env.local', '@@', '-a', '+b'), 2],
    ['a deleted .env', patch('*** Delete File: .env'), 2],
    ['a rename onto .env', patch('*** Update File: notes.txt', '*** Move to: .env', '@@', '-a', '+b'), 2],
    ['a secret after a harmless file', patch('*** Add File: a.txt', '+x', '*** Add File: .env', '+KEY=1'), 2],
    ['CRLF line endings', patch('*** Add File: .env', '+KEY=1').replaceAll('\\n', '\\r\\n'), 2],
    ['an indented header', patch('  *** Add File: .env', '+KEY=1'), 2],
    ['no space after the colon', patch('*** Add File:.env', '+KEY=1'), 2],
    ['a lowercase header', patch('*** add file: .env', '+KEY=1'), 2],
    ['a BOM-prefixed header', patch('﻿*** Add File: .env', '+KEY=1'), 2],
    ['a trailing tab', patch('*** Add File: .env\t', '+KEY=1'), 2],
    ['an added harmless file', patch('*** Add File: notes.txt', '+hello'), 0],
    ['a template', patch('*** Add File: .env.example', '+KEY=example'), 0],
    ['a header inside added text', patch('*** Add File: notes.txt', '+*** Add File: .env'), 0],
    ['a string that is not a patch', JSON.stringify({ tool_input: 'just text' }), 0],
  ] as const) {
    it(`${status === 2 ? 'blocks' : 'allows'} copilot apply_patch: ${name}`, async () => {
      const r = (await hook('copilot')).run(stdin);
      assert.equal(r.status, status, r.stderr);
    });
  }

  // Codex's apply_patch sends the raw patch in tool_input.command (probe A4,
  // docs/decisions/codex-target-2026-10.md).
  for (const [name, input, status] of [
    ['an added .env', { command: patchText('*** Add File: .env', '+KEY=1') }, 2],
    [
      'an updated secret by relative path',
      { command: patchText('*** Update File: config/.env.local', '@@', '-a', '+b') },
      2,
    ],
    ['a deleted private key', { command: patchText('*** Delete File: id_rsa') }, 2],
    ['an added harmless file', { command: patchText('*** Add File: src/a.ts', '+x') }, 0],
    ['a command that is not a patch', { command: 42 }, 0],
    // Codex supplies no path field on stdin (codex/hook-dialect.ts), so a bare file_path beside
    // the patch is not a path Codex ever sends; the patch text is the only source of paths.
    ['a non-patch command beside a file_path Codex never sends', { command: 'x', file_path: '.env' }, 0],
    [
      'a patch naming .env beside a file_path',
      { command: patchText('*** Add File: .env', '+KEY=1'), file_path: '.env' },
      2,
    ],
  ] as const) {
    it(`${status === 2 ? 'blocks' : 'allows'} codex apply_patch: ${name}`, async () => {
      const stdin = JSON.stringify({ tool_name: 'apply_patch', tool_input: input });
      const r = (await hook('codex')).run(stdin);
      assert.equal(r.status, status, r.stderr);
    });
  }
});
