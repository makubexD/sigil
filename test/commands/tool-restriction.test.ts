/**
 * An agent's tool restriction can never widen silently. Both providers give an agent every tool when
 * its frontmatter has no `tools:` line, so (1) the schema rejects an empty `tools`/`disallowedTools`
 * list, which the emitters would drop; (2) every agent that declares `tools` gets a `tools:` line from
 * every provider; and (3) `tool-restriction-coverage` fails `sync --check` when an agent ships to a
 * target whose agent spec cannot carry one of its restriction fields.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentSchema } from '../../dist-cli/schema';
import { renderArtifact } from '../../dist-cli/targets/emit';
import { CLAUDE_AGENT_SPEC } from '../../dist-cli/targets/claude-code/spec/agent';
import { COPILOT_AGENT_SPEC } from '../../dist-cli/targets/copilot/spec/agent';
import { runConformance } from '../../dist-cli/commands/sync/conformance/detect';
import { getAllTargets } from '../../dist-cli/targets/index';
import type { Artifact, LoadedCatalog, ResolvedArtifact } from '../../dist-cli/types';
import { loadResolvedCatalog } from '../helpers/catalog';
import { makeAgent } from '../helpers/fixtures';

const RULE = 'tool-restriction-coverage';

function catalogOf(artifacts: Artifact[]): LoadedCatalog {
  return {
    artifacts,
    byId: new Map(artifacts.map(a => [a.id, a])),
    languages: new Map(),
    skipWarnings: [],
  } as unknown as LoadedCatalog;
}

const agentWith = (fm: Record<string, unknown>) => makeAgent(fm) as unknown as Artifact;

describe('agent tool restriction — schema', () => {
  for (const field of ['tools', 'disallowedTools']) {
    it(`should reject an empty ${field} list`, () => {
      assert.equal(AgentSchema.safeParse(makeAgent({ [field]: [] }).frontmatter).success, false);
    });

    it(`should accept a non-empty ${field} list`, () => {
      assert.ok(AgentSchema.safeParse(makeAgent({ [field]: ['Read'] }).frontmatter).success);
    });
  }
});

describe('agent tool restriction — emitted on every provider', () => {
  for (const [provider, spec] of [
    ['claude', CLAUDE_AGENT_SPEC],
    ['copilot', COPILOT_AGENT_SPEC],
  ] as const) {
    it(`should give every catalog agent that declares tools a tools line on ${provider}`, async () => {
      const resolved = await loadResolvedCatalog();
      const agents = resolved.artifacts.filter(
        a => a.kind === 'agent' && Array.isArray(a.frontmatter.tools),
      );
      assert.ok(agents.length > 0);
      for (const agent of agents) {
        const out = renderArtifact(spec, agent as ResolvedArtifact, {});
        assert.match(out, /^tools:/m, `${agent.id} lost its tools on ${provider}`);
      }
    });
  }
});

describe('tool-restriction-coverage', () => {
  it('should flag a restriction a target the agent ships to cannot carry', () => {
    const agent = agentWith({ disallowedTools: ['Edit'] });
    const findings = runConformance(catalogOf([agent]), getAllTargets(), { ruleId: RULE });
    assert.deepEqual(
      findings.map(f => [f.severity, f.provider]),
      [['error', 'copilot']],
    );
  });

  it('should pass when the agent does not ship to that target', () => {
    const agent = agentWith({ disallowedTools: ['Edit'], platforms: ['claude'] });
    assert.deepEqual(runConformance(catalogOf([agent]), getAllTargets(), { ruleId: RULE }), []);
  });

  it('should pass a tools list every target carries', () => {
    const agent = agentWith({ tools: ['Read', 'Grep'] });
    assert.deepEqual(runConformance(catalogOf([agent]), getAllTargets(), { ruleId: RULE }), []);
  });
});
