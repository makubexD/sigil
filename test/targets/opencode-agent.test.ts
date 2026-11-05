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
import { CURSOR_AGENT_SPEC } from '../../dist-cli/targets/cursor/spec/agent';
import { OPENCODE_SKILL_SPEC } from '../../dist-cli/targets/opencode/spec/skill';
import { OPENCODE_LEXICON } from '../../dist-cli/targets/opencode/lexicon';
import { parseFrontmatter } from '../../dist-cli/frontmatter-parse';
import { makeAgent, makeCatalog, makeSkill } from '../helpers/fixtures';
import type { KindEmitSpec } from '../../dist-cli/targets/spec-types';
import type { ResolvedArtifact, ResolvedCatalog } from '../../dist-cli/types';

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

/** The three relation kinds, each pointing at an id co-present in the install set. */
const BOUNDARY_RELATED = [
  { id: 'shared/escalate', relation: 'escalates-to', reason: 'Deeper review.' },
  { id: 'shared/complement', relation: 'complements', reason: 'Adds tests.' },
  { id: 'shared/see-also', relation: 'see-also', reason: 'Background.' },
];

/** A minimal catalog whose `byId` holds every id {@link BOUNDARY_RELATED} points at. */
function boundaryCatalog() {
  return makeCatalog(
    BOUNDARY_RELATED.map(r => ({
      id: r.id,
      kind: 'agent',
      filePath: `/catalog/${r.id}.agent.md`,
      frontmatter: {
        id: r.id,
        kind: 'agent',
        title: r.id,
        description: 'desc',
        name: r.id.split('/')[1],
      },
      body: '',
    })),
  );
}

/** Renders an in-memory agent through `spec` with every related artifact co-present. */
function renderWithBoundary(spec: KindEmitSpec, fm: Record<string, unknown>): string {
  return renderArtifact(spec, makeAgent(fm) as unknown as ResolvedArtifact, {
    installSet: new Set(BOUNDARY_RELATED.map(r => r.id)),
    catalog: boundaryCatalog() as unknown as ResolvedCatalog,
  });
}

describe('opencode agent boundary heading', () => {
  it('should report co-installed agents when the agent cannot call task', () => {
    const out = renderWithBoundary(OPENCODE_AGENT_SPEC, {
      tools: ['read'],
      relatedArtifacts: BOUNDARY_RELATED,
    });

    assert.match(
      out,
      /Name these co-installed agents in your report, so the caller can hand the work over:/,
    );
    assert.doesNotMatch(out, /Delegate specialized work/);
  });

  it('should keep the delegate heading when the agent lists the agent tool', () => {
    const out = renderWithBoundary(OPENCODE_AGENT_SPEC, {
      tools: ['read', 'agent'],
      relatedArtifacts: BOUNDARY_RELATED,
    });

    assert.match(out, /Delegate specialized work to co-installed agents:/);
    assert.doesNotMatch(out, /Name these co-installed agents/);
  });

  it('should keep the delegate heading for an agent with no tools', () => {
    const out = renderWithBoundary(OPENCODE_AGENT_SPEC, { relatedArtifacts: BOUNDARY_RELATED });

    assert.match(out, /Delegate specialized work to co-installed agents:/);
    assert.doesNotMatch(out, /Name these co-installed agents/);
  });

  it('should keep the delegate heading on Cursor for the same input', () => {
    const out = renderWithBoundary(CURSOR_AGENT_SPEC, {
      tools: ['read'],
      relatedArtifacts: BOUNDARY_RELATED,
    });

    assert.match(out, /Delegate specialized work to co-installed agents:/);
    assert.doesNotMatch(out, /Name these co-installed agents/);
  });

  it('should render the complements and see-also groups unchanged', () => {
    const out = renderWithBoundary(OPENCODE_AGENT_SPEC, {
      tools: ['read'],
      relatedArtifacts: BOUNDARY_RELATED,
    });

    assert.match(out, /Related specialists \(distinct scope\):/);
    assert.match(out, /See also:/);
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
