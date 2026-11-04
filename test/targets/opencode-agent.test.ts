/**
 * The OpenCode `agent` and `skill` specs. An agent file at
 * `.opencode/agents/` writes only `description`, `mode` and `permission`; the skill spec writes
 * the shared `.agents/skills/` layout.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderArtifact } from '../../dist-cli/targets/emit';
import { restrictionOutcome } from '../../dist-cli/targets/tool-restriction';
import { checkOutputContract, deriveContracts } from '../../dist-cli/targets/output-contract';
import { OPENCODE_AGENT_SPEC } from '../../dist-cli/targets/opencode/spec/agent';
import { OPENCODE_SKILL_SPEC } from '../../dist-cli/targets/opencode/spec/skill';
import { OPENCODE_LEXICON } from '../../dist-cli/targets/opencode/lexicon';
import { parseFrontmatter } from '../../dist-cli/frontmatter-parse';
import { makeAgent, makeSkill } from '../helpers/fixtures';
import type { ResolvedArtifact } from '../../dist-cli/types';

/** Renders an in-memory agent through the OpenCode spec. */
function renderInMemory(fm: Record<string, unknown>): string {
  return renderArtifact(OPENCODE_AGENT_SPEC, makeAgent(fm) as unknown as ResolvedArtifact, {});
}

describe('opencode agent spec', () => {
  it('should write the agent to .opencode/agents/ with only description, mode and permission', () => {
    const agent = makeAgent({ name: 'x', tools: ['read', 'shell'] });

    assert.equal(
      OPENCODE_AGENT_SPEC.outputPath(agent as unknown as ResolvedArtifact, {}),
      '.opencode/agents/x.md',
    );

    const { data } = parseFrontmatter(renderInMemory({ name: 'x', tools: ['read', 'shell'] }));
    assert.deepEqual(Object.keys(data), ['description', 'mode', 'permission']);
  });

  it('should write no name, tools or model key in the frontmatter', () => {
    const out = renderInMemory({ name: 'x', tools: ['read', 'shell'] });
    const { data } = parseFrontmatter(out);

    for (const key of ['name', 'tools', 'model']) {
      assert.equal(key in data, false, `no ${key} key`);
    }
    assert.doesNotMatch(out, /^name:/m);
    assert.doesNotMatch(out, /^tools:/m);
    assert.doesNotMatch(out, /^model:/m);
  });

  it('should keep a description holding a colon intact', () => {
    const description = 'Use for: reviewing code';
    const { data } = parseFrontmatter(renderInMemory({ description }));

    assert.equal(data.description, description);
  });

  it('should write no permission block for an agent with no tools, keeping mode: subagent', () => {
    const { data } = parseFrontmatter(renderInMemory({}));

    assert.equal('permission' in data, false);
    assert.equal(data.mode, 'subagent');
  });

  it('should skip a disallowedTools restriction the spec does not carry', () => {
    const agent = makeAgent({ disallowedTools: ['shell'] });
    const outcome = restrictionOutcome(OPENCODE_AGENT_SPEC, agent.frontmatter);

    assert.equal(outcome.kind, 'skip');
    if (outcome.kind !== 'skip') return;
    assert.match(outcome.reason, /disallowedTools/);
  });

  it('should write no model key for an agent authoring model or claude.model', () => {
    const { data } = parseFrontmatter(
      renderInMemory({ model: 'deep', claude: { model: 'some-model' } }),
    );

    assert.equal('model' in data, false);
  });

  it('should pass the output contract for a rendered agent', () => {
    const agent = makeAgent({ name: 'x', tools: ['read', 'shell'] });
    const out = renderInMemory({ name: 'x', tools: ['read', 'shell'] });
    const files = {
      [OPENCODE_AGENT_SPEC.outputPath(agent as unknown as ResolvedArtifact, {})]: out,
    };

    assert.deepEqual(checkOutputContract(files, deriveContracts([OPENCODE_AGENT_SPEC])), []);
  });
});

describe('opencode skill spec', () => {
  it('should write the shared .agents/skills/ layout with the OpenCode lexicon', () => {
    const skill = makeSkill({ name: 'x' });

    assert.equal(
      OPENCODE_SKILL_SPEC.outputPath(skill as unknown as ResolvedArtifact, {}),
      '.agents/skills/x/SKILL.md',
    );
    assert.equal(OPENCODE_SKILL_SPEC.lexicon, OPENCODE_LEXICON);
  });
});
