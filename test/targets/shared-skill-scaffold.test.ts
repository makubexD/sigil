/**
 * Shared (language-less) skills scaffold end-to-end on both targets: the skill folder with its
 * references/, plus the `uses:` closure (a path-scoped rule and an auditor agent with no edit tools).
 * Exercised with the real catalog's shared/cli skill (migrated from a multi-file skill — see
 * docs/decisions/distribution-channels-2026-09.md, Task M).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeCodeTarget } from '../../dist-cli/targets/claude-code';
import { CopilotTarget } from '../../dist-cli/targets/copilot';
import { loadResolvedCatalog } from '../helpers/catalog';

const OPTS = { projectDir: '/fake' };

describe('shared skill scaffold (shared/cli)', () => {
  it('claude: skill + references + rule with paths: + auditor agent', async () => {
    const files = await new ClaudeCodeTarget().scaffold!(
      'shared/cli',
      await loadResolvedCatalog(),
      OPTS,
    );

    assert.ok('.claude/skills/cli/SKILL.md' in files, 'skill scaffolded');
    assert.ok('.claude/skills/cli/references/grammar.md' in files, 'reference scaffolded');
    assert.ok(
      '.claude/skills/cli/references/stack-node-ts.md' in files,
      'stack reference scaffolded',
    );
    const rule = files['.claude/rules/shared-cli-rules.md'];
    assert.ok(rule?.includes('paths:'), 'rule is path-scoped');
    const agent = files['.claude/agents/cli-auditor.md'];
    assert.match(
      agent ?? '',
      /^tools: Read, Grep, Glob, Bash$/m,
      'auditor has no Edit/Write tools',
    );
    assert.match(agent ?? '', /^skills:\n {2}- cli$/m, 'auditor preloads its skill');
  });

  it('copilot: skill + references + applyTo instructions + auditor agent', async () => {
    const files = await new CopilotTarget().scaffold!(
      'shared/cli',
      await loadResolvedCatalog(),
      OPTS,
    );

    assert.ok('.github/skills/cli/SKILL.md' in files, 'skill scaffolded');
    assert.ok('.github/skills/cli/references/auditor.md' in files, 'reference scaffolded');
    const rule = files['.github/instructions/shared-cli-rules.instructions.md'];
    assert.ok(rule?.includes('applyTo:'), 'instructions are path-scoped');
    assert.ok('.github/agents/cli-auditor.agent.md' in files, 'auditor agent scaffolded');
  });

  it('migrated bodies carry no install-by-agent (adopt) mode or unresolved placeholders', async () => {
    const catalog = await loadResolvedCatalog();
    for (const id of [
      'shared/cli',
      'shared/wizard',
      'shared/cli-auditor',
      'shared/wizard-auditor',
    ]) {
      const body = catalog.byId.get(id)?.body ?? '';
      assert.ok(body.length > 0, `${id} present`);
      assert.ok(!/`adopt`|assets\/adapters/.test(body), `${id} has no adopt mode`);
      assert.ok(!/\{\{[A-Z_]+\}\}/.test(body), `${id} has no unresolved {{PLACEHOLDER}}`);
    }
  });
});
