/**
 * shared/feature — the gated spec-driven-development conductor (conducts addyosmani/agent-skills).
 * Emits on both targets from one provider-neutral body: Claude keeps its user-only invocation
 * flag and `$ARGUMENTS`; Copilot gets the lexicon's neutral text and no Claude-only literals.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeCodeTarget } from '../../dist-cli/targets/claude-code';
import { CopilotTarget } from '../../dist-cli/targets/copilot';
import path from 'path';
import { loadAndValidate } from '../../dist-cli/cli-helpers';
import { resolveSelection } from '../../dist-cli/select/selector-resolve';
import { CATALOG_DIR, loadResolvedCatalog } from '../helpers/catalog';

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
    assert.ok(skill.includes('Read AGENTS.md'), 'conventions file translated for Copilot');
    for (const literal of ['$ARGUMENTS', 'CLAUDE.md', 'disable-model-invocation', '{sigil:']) {
      assert.ok(!skill.includes(literal), `no ${literal} in Copilot output`);
    }
    assert.ok('.github/skills/feature/references/examples.md' in files, 'examples scaffolded');
  });

  it('body: install lines add the marketplace first; plan phases stay write-free', async () => {
    const files = await new CopilotTarget().scaffold!(
      'shared/feature',
      await loadResolvedCatalog(),
      OPTS,
    );
    const skill = files['.github/skills/feature/SKILL.md'] ?? '';
    assert.ok(skill.includes('claude plugin marketplace add addyosmani/agent-skills'));
    assert.ok(skill.includes('copilot plugin install addyosmani/agent-skills'));
    assert.match(skill, /written only after GATE 3/, 'planning files wait for edit permission');
  });

  it('the spec-driven pack installs it on both targets', async () => {
    const { packsConfig } = await loadAndValidate(
      CATALOG_DIR,
      path.resolve(CATALOG_DIR, '../packs.yaml'),
    );
    for (const targetName of ['claude', 'copilot']) {
      const { ids } = resolveSelection({
        selectors: ['pack:spec-driven'],
        filters: {},
        catalog: await loadResolvedCatalog(),
        packs: packsConfig.packs,
        targetName,
      });
      assert.deepEqual(ids, ['shared/feature'], `pack resolves on ${targetName}`);
    }
  });
});
