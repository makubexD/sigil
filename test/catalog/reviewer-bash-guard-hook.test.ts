/**
 * `shared/reviewer-bash-guard` end to end: the hook entry sigil writes is spawned exactly the way
 * Claude Code spawns an exec-form hook (`command` + `args`, no shell — code.claude.com/docs/en/hooks
 * "Exec form and shell form"), with the PreToolUse payload as JSON on stdin. The hook blocks
 * write-shaped Bash commands only when `agent_type` names one of the read-only reviewer agents,
 * and lets the main session (no `agent_type`) and every other agent through.
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

const ARTIFACT = 'shared/reviewer-bash-guard';
const REVIEWER = 'cs-code-reviewer';

async function installedHook(): Promise<{ matcher: string; entry: HookEntry }> {
  const ops = await new ClaudeCodeTarget().scaffoldConfig!(
    ARTIFACT,
    await loadResolvedCatalog(),
    { projectDir: '/fake', overwrite: false, scope: 'project' },
  );
  const group = (ops[0]!.fragment.hooks as Record<string, { matcher: string; hooks: HookEntry[] }[]>)
    .PreToolUse![0]!;
  return { matcher: group.matcher, entry: group.hooks[0]! };
}

function run(entry: HookEntry, stdin: string): { status: number | null; stderr: string } {
  assert.ok(entry.args, 'exec form: args must be set so no shell touches the exit code');
  const r = spawnSync(entry.command === 'node' ? process.execPath : entry.command, entry.args, {
    input: stdin,
    encoding: 'utf8',
  });
  return { status: r.status, stderr: r.stderr };
}

/** A PreToolUse Bash payload. `agentType === undefined` omits the key (main session); '' keeps it. */
function bash(command: string, agentType?: string): string {
  return JSON.stringify({
    tool_name: 'Bash',
    ...(agentType === undefined ? {} : { agent_type: agentType }),
    tool_input: { command },
  });
}

/** Frontmatter `tools` as a string list; undefined becomes an empty list. */
function toolsOf(artifact: { frontmatter: Record<string, unknown> }): string[] {
  return Array.isArray(artifact.frontmatter.tools)
    ? (artifact.frontmatter.tools as string[])
    : [];
}

/** Frontmatter string with its whitespace collapsed (YAML folding leaves line breaks). */
function collapsed(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ');
}

describe('shared/reviewer-bash-guard hook', () => {
  it('matches Bash only', async () => {
    assert.equal((await installedHook()).matcher, 'Bash');
  });

  for (const command of [
    'echo x > out.txt',
    'cat a >> b',
    'ls | tee out.txt',
    'sed -i s/a/b/ f',
    'perl -pi -e s/a/b/ f',
    'rm -rf dist',
    'mv a b',
    'cp a b',
    'mkdir x',
    'touch x',
    'chmod +x f',
    'ln -s a b',
    'git commit -m x',
    'git push',
    'git add .',
    'git checkout -- f',
    'git restore f',
    'git reset --hard',
    'git stash',
    'git clean -fd',
    'git apply p.diff',
    'npm install',
    'npm ci',
    'pnpm add x',
    'yarn add x',
    'pip install x',
    'dotnet add package X',
    'npm audit fix',
    'eslint . --fix',
    'prettier --write .',
    'ruff format .',
    'ruff check --fix .',
    'dotnet format',
    'git diff && rm x',
    'node -e "x"',
    'python -c "x"',
    'bash -c "ls"',
    'sh -c "ls"',
    // a runner prefix starts another command, which is checked in its place
    'npx prettier --write src',
    'pnpm dlx prettier --write .',
    'npm exec -- eslint . --fix',
    'yarn dlx rimraf x',
    'bun x prettier --write .',
    'uv run ruff format .',
    'poetry run black .',
  ]) {
    it(`blocks \`${command}\``, async () => {
      const r = run((await installedHook()).entry, bash(command, REVIEWER));
      assert.equal(r.status, 2, r.stderr);
      assert.ok(r.stderr.includes(REVIEWER), `stderr must name the agent: ${r.stderr}`);
      assert.match(r.stderr, /blocked/i);
    });
  }

  for (const command of [
    'git diff HEAD',
    'git log --oneline -10',
    'git status',
    'git show HEAD',
    'grep -rn foo src',
    'cat package.json',
    'npm audit --omit=dev',
    'npx tsc --noEmit',
    'eslint .',
    'ruff format --check .',
    'ruff check .',
    'dotnet format --verify-no-changes',
    'ng test --watch=false',
    'pytest -q',
    'npm test 2>&1',
    'ls > /dev/null',
    'ls 2>/dev/null',
    'npx eslint . --max-warnings 0',
    'uv run pytest -q',
    'pnpm exec tsc --noEmit',
  ]) {
    it(`allows \`${command}\``, async () => {
      assert.equal(run((await installedHook()).entry, bash(command, REVIEWER)).status, 0);
    });
  }

  it('only blocks the read-only reviewer agent identities', async () => {
    const { entry } = await installedHook();
    for (const agentType of [undefined, '', 'cs-debugger', 'ts-refactor-specialist']) {
      const r = run(entry, bash('echo x > out.txt', agentType));
      assert.equal(r.status, 0, `agent_type=${String(agentType)}: ${r.stderr}`);
    }
    for (const agentType of ['csharp-starter:cs-code-reviewer', 'ng-template-reviewer']) {
      const r = run(entry, bash('echo x > out.txt', agentType));
      assert.equal(r.status, 2, `agent_type=${agentType}: ${r.stderr}`);
    }
  });

  it('ignores tools other than Bash', async () => {
    const stdin = JSON.stringify({
      tool_name: 'Edit',
      agent_type: REVIEWER,
      tool_input: { file_path: 'src/a.ts', old_string: 'a', new_string: 'echo x > out.txt' },
    });
    assert.equal(run((await installedHook()).entry, stdin).status, 0);
  });

  it('fails open on input it cannot read', async () => {
    const { entry } = await installedHook();
    for (const stdin of [
      '',
      'not json',
      '[]',
      '{"tool_input":null}',
      '{"tool_input":{"command":7}}',
    ]) {
      assert.equal(run(entry, stdin).status, 0, stdin);
    }
  });
});

describe('shared/reviewer-bash-guard catalog coverage', () => {
  it('blocks every read-only reviewer agent under its own and a plugin-qualified name', async () => {
    const catalog = await loadResolvedCatalog();
    const agents = catalog.artifacts.filter(a => a.kind === 'agent');
    const readOnlyReviewers = agents.filter(a => {
      const tools = toolsOf(a);
      return (
        tools.includes('Bash') &&
        !tools.includes('Edit') &&
        !tools.includes('Write') &&
        /makes no edits/i.test(collapsed(a.frontmatter.description))
      );
    });
    assert.ok(readOnlyReviewers.length > 0, 'the catalog must contain read-only reviewer agents');
    assert.equal(readOnlyReviewers.length, 21);

    const { entry } = await installedHook();
    for (const artifact of readOnlyReviewers) {
      const name = collapsed(artifact.frontmatter.name);
      for (const agentType of [name, `some-plugin:${name}`]) {
        const r = run(entry, bash('echo x > out.txt', agentType));
        assert.equal(r.status, 2, `${agentType}: ${r.stderr}`);
        assert.ok(r.stderr.includes(name), `stderr must name ${name}: ${r.stderr}`);
      }
    }

    for (const artifact of agents) {
      const tools = toolsOf(artifact);
      if (!tools.includes('Edit') && !tools.includes('Write')) continue;
      const name = collapsed(artifact.frontmatter.name);
      assert.equal(run(entry, bash('echo x > out.txt', name)).status, 0, name);
    }
  });
});
