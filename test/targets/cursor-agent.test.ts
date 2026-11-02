/**
 * The Cursor `agent` spec (unregistered until step 4): a subagent file at `.cursor/agents/`
 * lists no tools, so its `readonly` line is the nearest mapping of the catalog's neutral tool
 * list, and a list the switch cannot carry is skipped rather than widened.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderArtifact } from '../../dist-cli/targets/emit';
import { restrictionOutcome } from '../../dist-cli/targets/tool-restriction';
import { CURSOR_AGENT_SPEC } from '../../dist-cli/targets/cursor/spec/agent';
import { parseFrontmatter } from '../../dist-cli/frontmatter-parse';
import { loadResolvedCatalog } from '../helpers/catalog';
import { makeAgent } from '../helpers/fixtures';
import type { ResolvedArtifact, ResolvedCatalog } from '../../dist-cli/types';

/** Frontmatter keys a Cursor subagent file may carry from this spec. */
const CURSOR_AGENT_KEYS = new Set(['name', 'description', 'readonly']);

/** Renders a catalog agent through the Cursor spec; fails when the id is absent. */
function renderCatalogAgent(catalog: ResolvedCatalog, id: string): string {
  const artifact = catalog.byId.get(id);
  assert.ok(artifact, `${id} is in the catalog`);
  return renderArtifact(CURSOR_AGENT_SPEC, artifact, {});
}

/** Renders an in-memory agent through the Cursor spec. */
function renderInMemory(fm: Record<string, unknown>): string {
  return renderArtifact(CURSOR_AGENT_SPEC, makeAgent(fm) as unknown as ResolvedArtifact, {});
}

describe('cursor agent spec — catalog', () => {
  it('should write shared/code-reviewer as readonly: true, warning that shell was lost', async () => {
    const catalog = await loadResolvedCatalog();
    const artifact = catalog.byId.get('shared/code-reviewer');
    assert.ok(artifact, 'shared/code-reviewer is in the catalog');

    assert.equal(CURSOR_AGENT_SPEC.outputPath(artifact, {}), '.cursor/agents/code-reviewer.md');
    assert.ok(CURSOR_AGENT_SPEC.pathPattern.test('.cursor/agents/code-reviewer.md'));

    const out = renderCatalogAgent(catalog, 'shared/code-reviewer');
    assert.match(out, /^readonly: true$/m);

    const outcome = restrictionOutcome(CURSOR_AGENT_SPEC, artifact.frontmatter);
    assert.equal(outcome.kind, 'nearest');
    if (outcome.kind !== 'nearest') return;
    assert.match(outcome.warning, /shell/);
  });

  it('should leave the readonly line off python/py-debugger, warning that edit and shell were lost', async () => {
    const catalog = await loadResolvedCatalog();
    const artifact = catalog.byId.get('python/py-debugger');
    assert.ok(artifact, 'python/py-debugger is in the catalog');

    const out = renderCatalogAgent(catalog, 'python/py-debugger');
    assert.doesNotMatch(out, /^readonly:/m);

    const outcome = restrictionOutcome(CURSOR_AGENT_SPEC, artifact.frontmatter);
    assert.equal(outcome.kind, 'nearest');
    if (outcome.kind !== 'nearest') return;
    // `missing` keeps the authored order, which is `shell, edit` here.
    assert.match(outcome.warning, /\bedit\b/);
    assert.match(outcome.warning, /\bshell\b/);
  });

  it('should render every catalog agent with only the Cursor agent keys', async () => {
    const catalog = await loadResolvedCatalog();
    const agents = catalog.artifacts.filter(a => a.kind === 'agent');
    assert.ok(agents.length > 0, 'the catalog has agents');

    for (const agent of agents) {
      const out = renderArtifact(CURSOR_AGENT_SPEC, agent, {});
      for (const key of Object.keys(parseFrontmatter(out).data)) {
        assert.ok(CURSOR_AGENT_KEYS.has(key), `${agent.id} emitted ${key}`);
      }
    }
  });

  it('should mark every catalog agent with no edit tool readonly', async () => {
    const catalog = await loadResolvedCatalog();
    const readOnlyAgents = catalog.artifacts.filter(
      a => a.kind === 'agent' && !(a.frontmatter.tools as string[]).includes('edit'),
    );
    assert.ok(readOnlyAgents.length > 0, 'the catalog has read-only agents');

    for (const agent of readOnlyAgents) {
      assert.match(renderArtifact(CURSOR_AGENT_SPEC, agent, {}), /^readonly: true$/m);
    }
  });

  it('should round-trip every catalog agent through the frontmatter parser', async () => {
    const catalog = await loadResolvedCatalog();
    const agents = catalog.artifacts.filter(a => a.kind === 'agent');
    assert.ok(agents.length > 0, 'the catalog has agents');

    for (const agent of agents) {
      const { data } = parseFrontmatter(renderArtifact(CURSOR_AGENT_SPEC, agent, {}));
      assert.equal(data.name, agent.frontmatter.name);
      assert.equal(data.description, agent.frontmatter.description);
    }
  });
});

describe('cursor agent spec — in-memory', () => {
  it('should mark a read-only list readonly and call it exact', () => {
    const agent = makeAgent({ tools: ['read', 'search'] });
    assert.match(renderInMemory(agent.frontmatter), /^readonly: true$/m);
    assert.deepEqual(restrictionOutcome(CURSOR_AGENT_SPEC, agent.frontmatter), { kind: 'exact' });
  });

  it('should skip a strict list naming shell and refuse to render it', () => {
    const agent = makeAgent({ tools: ['read', 'search', 'shell'] });
    const outcome = restrictionOutcome(CURSOR_AGENT_SPEC, agent.frontmatter);
    assert.equal(outcome.kind, 'skip');
    if (outcome.kind !== 'skip') return;
    assert.match(outcome.reason, /shell/);
    assert.throws(() => renderInMemory(agent.frontmatter), /shell/);
  });

  it('should write no readonly line for an agent with no tools, and call it exact', () => {
    const agent = makeAgent({});
    assert.doesNotMatch(renderInMemory(agent.frontmatter), /^readonly:/m);
    assert.deepEqual(restrictionOutcome(CURSOR_AGENT_SPEC, agent.frontmatter), { kind: 'exact' });
  });

  it('should skip a disallowedTools restriction the spec does not carry', () => {
    const agent = makeAgent({ disallowedTools: ['edit'] });
    const outcome = restrictionOutcome(CURSOR_AGENT_SPEC, agent.frontmatter);
    assert.equal(outcome.kind, 'skip');
    if (outcome.kind !== 'skip') return;
    assert.match(outcome.reason, /disallowedTools/);
  });
});
