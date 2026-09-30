/**
 * shared/feature — the gated spec-driven-development conductor (conducts addyosmani/agent-skills).
 * Emits on both targets from one provider-neutral body: Claude keeps its user-only invocation
 * flag and `$ARGUMENTS`; Copilot gets the lexicon's neutral text and no Claude-only literals.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeCodeTarget } from '../../dist-cli/targets/claude-code';
import { CopilotTarget } from '../../dist-cli/targets/copilot';
import { loadResolvedCatalog } from '../helpers/catalog';

const OPTS = { projectDir: '/fake' };

describe('shared/feature skill', () => {
  it('claude: user-invoked skill with argument hint, $ARGUMENTS and references', async () => {
    const files = await new ClaudeCodeTarget().scaffold!(
      'shared/feature',
      await loadResolvedCatalog(),
      OPTS,
    );

    const skill = files['.claude/skills/feature/SKILL.md'] ?? '';
    assert.ok(skill, 'skill scaffolded');
    assert.match(skill, /^disable-model-invocation: true$/m);
    assert.match(skill, /^argument-hint: "/m);
    assert.ok(skill.includes('$ARGUMENTS'), 'request placeholder translated for Claude');
    assert.ok(skill.includes('agent-skills:'), 'names the Claude plugin namespace');
    assert.ok('.claude/skills/feature/references/examples.md' in files, 'examples scaffolded');
  });

  it('copilot: no Claude-only literals, arguments line and references', async () => {
    const files = await new CopilotTarget().scaffold!(
      'shared/feature',
      await loadResolvedCatalog(),
      OPTS,
    );

    const skill = files['.github/skills/feature/SKILL.md'] ?? '';
    assert.ok(skill, 'skill scaffolded');
    assert.match(skill, /^\*\*Arguments:\*\* /m);
    assert.ok(skill.includes('the request you were given'), 'neutral request text');
    for (const literal of ['$ARGUMENTS', 'CLAUDE.md', 'disable-model-invocation', '{sigil:']) {
      assert.ok(!skill.includes(literal), `no ${literal} in Copilot output`);
    }
    assert.ok('.github/skills/feature/references/examples.md' in files, 'examples scaffolded');
  });

  it('examples reference carries no project-specific prompts', async () => {
    const files = await new CopilotTarget().scaffold!(
      'shared/feature',
      await loadResolvedCatalog(),
      OPTS,
    );
    const examples = files['.github/skills/feature/references/examples.md'] ?? '';
    assert.ok(examples.length > 0, 'examples present');
    assert.ok(!/\bgid\b/.test(examples), 'no gid-specific prompts');
  });
});
