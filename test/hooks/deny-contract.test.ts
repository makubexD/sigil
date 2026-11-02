/**
 * The deny contract every hook target installs for `shared/protect-config`: the entry sigil writes
 * is run exactly the way that agent runs it — Claude Code and Copilot as the exec form (`command`/
 * `exec` + `args`, no shell — code.claude.com/docs/en/hooks "Exec form and shell form"), Codex and
 * Cursor as their one-line `node -e` command through `sh -c` (docs/decisions/
 * neutral-hook-contract-2026-11.md decision 5). A `.env` write must block with exit 2 and the
 * reason on stderr whatever the host; a normal source file and unparseable input must both pass.
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

/** Every hook target that installs this artifact, with the way it spawns the entry. */
const TARGETS: readonly { name: TargetName; target: Target; form: 'exec' | 'command-line' }[] = [
  { name: 'claude', target: new ClaudeCodeTarget(), form: 'exec' },
  { name: 'copilot', target: new CopilotTarget(), form: 'exec' },
  { name: 'codex', target: new CodexTarget(), form: 'command-line' },
  { name: 'cursor', target: new CursorTarget(), form: 'command-line' },
];

interface HookEntry {
  command?: string;
  exec?: string;
  args?: string[];
}

interface HookGroup {
  hooks: HookEntry[];
}

interface RenderedCommand {
  /** Runs the rendered entry exactly as the agent does. */
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
function runCommandLine(
  commandLine: string,
  stdin: string,
): { status: number | null; stderr: string } {
  const nodeDir = path.dirname(process.execPath);
  const env = { ...process.env, PATH: `${nodeDir}${path.delimiter}${process.env.PATH ?? ''}` };
  const r = spawnSync('sh', ['-c', commandLine], { input: stdin, encoding: 'utf8', env });
  return { status: r.status, stderr: r.stderr };
}

/** Renders the artifact for one target and returns the command that target would run. */
async function render(name: TargetName, form: 'exec' | 'command-line'): Promise<RenderedCommand> {
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
      const entry = (fragment.hooks as Record<string, HookGroup[]>).PreToolUse![0]!.hooks[0]!;
      return { run: stdin => runExec(entry.command!, entry.args, stdin) };
    }
    case 'copilot': {
      const entry = (fragment.hooks as Record<string, HookEntry[]>).PreToolUse![0]!;
      return { run: stdin => runExec(entry.exec!, entry.args, stdin) };
    }
    case 'codex': {
      const entry = (fragment.hooks as Record<string, HookGroup[]>).PreToolUse![0]!.hooks[0]!;
      return { run: stdin => runCommandLine(entry.command!, stdin) };
    }
    case 'cursor': {
      const entry = (fragment.hooks as Record<string, HookEntry[]>).preToolUse![0]!;
      return { run: stdin => runCommandLine(entry.command!, stdin) };
    }
  }
  assert.fail(`unknown hook target ${name} (${form})`);
}

const patch = (filePath: string) =>
  ['*** Begin Patch', `*** Add File: ${filePath}`, '+x', '*** End Patch', ''].join('\n');

/** One file write in the stdin shape `name` really sends (hook-dialect.ts per target). */
function writePayload(name: TargetName, filePath: string): string {
  switch (name) {
    case 'claude':
    case 'cursor':
      return JSON.stringify({ tool_name: 'Write', tool_input: { file_path: filePath } });
    case 'copilot':
      return JSON.stringify({ tool_name: 'Edit', tool_input: patch(filePath) });
    case 'codex':
      return JSON.stringify({ tool_name: 'apply_patch', tool_input: { command: patch(filePath) } });
  }
}

describe('shared/protect-config deny contract', () => {
  for (const { name, form } of TARGETS) {
    describe(`rendered for ${name}`, () => {
      it('denies a .env write with exit 2 and the reason on stderr', async () => {
        const r = (await render(name, form)).run(writePayload(name, '.env'));
        assert.equal(r.status, 2, r.stderr);
        assert.match(r.stderr, /sigil-hook: blocked write to protected file \.env/);
      });

      it('allows a write to src/index.ts', async () => {
        const r = (await render(name, form)).run(writePayload(name, 'src/index.ts'));
        assert.equal(r.status, 0, r.stderr);
      });

      it('fails open on input that is not JSON', async () => {
        const r = (await render(name, form)).run('not json');
        assert.equal(r.status, 0, r.stderr);
      });
    });
  }
});
