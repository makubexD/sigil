/**
 * `shared/read-only-agent-guard` end to end: the hook entry sigil writes is spawned the way Claude
 * Code spawns an exec-form hook, with a PreToolUse Bash input as stdin. Inside a subagent that input
 * carries `agent_type` (code.claude.com/docs/en/hooks, "Common input fields"). The guarded names
 * are checked against the catalog: every agent whose tools are exactly Read, Grep, Glob and Bash.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ClaudeCodeTarget } from '../../dist-cli/targets/claude-code';
import { loadResolvedCatalog } from '../helpers/catalog';

interface HookEntry {
  type: string;
  command: string;
  args?: string[];
}

const ID = 'shared/read-only-agent-guard';
const READ_ONLY_TOOLS = ['Bash', 'Glob', 'Grep', 'Read'];
/** Read-only agents whose brief runs the program under audit in a temporary directory. */
const EXEMPT = new Set(['cli-auditor', 'wizard-auditor']);

async function installedHook(): Promise<{ matcher: string; entry: HookEntry }> {
  const ops = await new ClaudeCodeTarget().scaffoldConfig!(ID, await loadResolvedCatalog(), {
    projectDir: '/fake',
    overwrite: false,
    scope: 'project',
  });
  const group = (
    ops[0]!.fragment.hooks as Record<string, { matcher: string; hooks: HookEntry[] }[]>
  ).PreToolUse![0]!;
  return { matcher: group.matcher, entry: group.hooks[0]! };
}

function run(entry: HookEntry, input: object): { status: number | null; stderr: string } {
  assert.ok(entry.args, 'exec form: args must be set so no shell touches the exit code');
  const r = spawnSync(entry.command === 'node' ? process.execPath : entry.command, entry.args, {
    input: JSON.stringify(input),
    encoding: 'utf8',
  });
  return { status: r.status, stderr: r.stderr };
}

const bash = (command: string, agent: string | undefined = 'ts-code-reviewer') => ({
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command },
  ...(agent === undefined ? {} : { agent_type: agent, agent_id: 'a1' }),
});

describe('shared/read-only-agent-guard hook', () => {
  it('matches Bash only', async () => {
    assert.equal((await installedHook()).matcher, 'Bash');
  });

  it('guards exactly the catalog agents that have read-only tools', async () => {
    const catalog = await loadResolvedCatalog();
    const expected = catalog.artifacts
      .filter(a => a.kind === 'agent')
      .filter(a => {
        const tools = (a.frontmatter as { tools?: string[] }).tools;
        return tools !== undefined && [...tools].sort().join() === READ_ONLY_TOOLS.join();
      })
      .map(a => (a.frontmatter as { name: string }).name)
      .filter(name => !EXEMPT.has(name))
      .sort();
    const { entry } = await installedHook();
    const list = /new Set\(\[([^\]]*)\]\)/.exec(entry.args!.join('\n'))?.[1] ?? '';
    const guarded = [...list.matchAll(/'([\w-]+)'/g)].map(m => m[1]).sort();
    assert.deepEqual(guarded, expected);
  });

  for (const command of [
    'echo x > src/a.ts',
    'cat a >> b',
    'rm -rf dist',
    'npm test && mkdir out',
    'x=$(touch f)',
    'sed -i s/a/b/ src/a.ts',
    'npx eslint --fix .',
    'ruff format .',
    'dotnet format',
    'git commit -am "wip"',
    'git stash',
    'git stash -u',
    'git checkout -- src',
    'git tag v1.0',
    'git config user.name x',
    'npm install lodash',
    'pip install requests',
    "node -e \"require('fs').writeFileSync('a', '')\"",
    'Remove-Item -Recurse dist',
  ]) {
    it(`blocks ${command}`, async () => {
      const r = run((await installedHook()).entry, bash(command));
      assert.equal(r.status, 2, r.stderr);
      assert.match(r.stderr, /sigil-hook: ts-code-reviewer makes no edits/);
    });
  }

  for (const command of [
    'git status',
    'git diff HEAD~1 -- src',
    'git log --oneline | head -20',
    'git stash list',
    'git tag -l',
    'git branch -a',
    'grep -rn "a > b" src',
    'npm test 2>&1',
    'npx tsc --noEmit 2>/dev/null || true',
    'ruff format --check .',
    'dotnet format --verify-no-changes',
    'echo $((2 > 1))',
  ]) {
    it(`allows ${command}`, async () => {
      const r = run((await installedHook()).entry, bash(command));
      assert.equal(r.status, 0, r.stderr);
    });
  }

  it('reads a plugin-prefixed agent name', async () => {
    const r = run((await installedHook()).entry, bash('rm -rf dist', 'sigil:ts-code-reviewer'));
    assert.equal(r.status, 2, r.stderr);
  });

  for (const agent of [undefined, 'ts-refactor-specialist', 'wizard-auditor']) {
    it(`leaves ${agent ?? 'the main session'} alone`, async () => {
      const r = run((await installedHook()).entry, bash('rm -rf dist', agent));
      assert.equal(r.status, 0, r.stderr);
    });
  }

  it('lets input it cannot parse through', async () => {
    const r = spawnSync(process.execPath, (await installedHook()).entry.args!, {
      input: 'not json',
      encoding: 'utf8',
    });
    assert.equal(r.status, 0);
  });
});
