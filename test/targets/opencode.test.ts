/**
 * The OpenCode target against the whole catalog: one compile for the three whole-file kinds plus
 * the aggregate AGENTS.md, the same skill bytes as Codex, and the kinds and channels it refuses.
 * Counts come from the ADR's table on 2026-11-03 (docs/decisions/opencode-target-2026-11.md).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getTarget } from '../../dist-cli/targets/index';
import { parseFrontmatter } from '../../dist-cli/frontmatter-parse';
import { restrictionOutcome } from '../../dist-cli/targets/tool-restriction';
import { OPENCODE_AGENT_SPEC } from '../../dist-cli/targets/opencode/spec/agent';
import { isRepoWideRule } from '../../dist-cli/targets/shared/repo-wide-rules';
import { contractsFor } from '../../dist-cli/targets/all-emit-specs';
import { checkOutputContract } from '../../dist-cli/targets/output-contract';
import { loadResolvedCatalog } from '../helpers/catalog';
import { catalogForPlatform } from '../../dist-cli/select';
import { resolveSelection } from '../../dist-cli/select/selector-resolve';
import {
  carriedKinds,
  installableKinds,
  kindSupport,
  supportsKind,
} from '../../dist-cli/targets/capabilities';
import type { ArtifactKind, FileMap, ResolvedArtifact } from '../../dist-cli/types';

const TARGET = 'opencode';
const PEER = 'agents-standard';
const CODEX = 'codex';

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Compiles what `build` compiles: the catalog filtered for `target`, so `mk-check` is left out. */
async function compile(target = TARGET): Promise<FileMap> {
  const catalog = catalogForPlatform(await loadResolvedCatalog(), target);
  return getTarget(target).compile(catalog, { version: '0.0.0', packs: [] });
}

/** Every path in `files` under `dir`. */
function filesUnder(files: FileMap, dir: string): string[] {
  return Object.keys(files).filter(f => f.startsWith(dir));
}

describe('opencode target over the whole catalog', () => {
  it('should compile 45 skills, 39 agents and the one shippable prompt', async () => {
    const files = await compile();

    const skills = filesUnder(files, '.agents/skills/').filter(f => f.endsWith('/SKILL.md'));
    const agents = filesUnder(files, '.opencode/agents/');
    const prompts = filesUnder(files, '.opencode/commands/');

    assert.equal(skills.length, 45);
    assert.equal(agents.length, 39);
    assert.equal(prompts.length, 1);
    // explain-diff holds too many arguments for OpenCode's quoting (step 1), so author-artifact
    // is the only command left.
    assert.deepEqual(prompts, ['.opencode/commands/shared-author-artifact.md']);
  });

  it('should write AGENTS.md with only repo-wide rules, and no .opencode/skills/ path', async () => {
    const catalog = await loadResolvedCatalog();
    const files = await compile();
    const agentsMd = files['AGENTS.md'];
    assert.ok(agentsMd, 'AGENTS.md is written');

    const rules = catalog.artifacts.filter(a => a.kind === 'rule');
    const repoWide = rules.filter(isRepoWideRule);
    assert.ok(repoWide.length > 0, 'the catalog has repo-wide rules');
    for (const rule of repoWide) {
      const title = rule.frontmatter.title as string;
      assert.match(agentsMd, new RegExp(`^## ${escapeRegExp(title)}$`, 'm'), rule.id);
    }
    for (const rule of rules.filter(a => !isRepoWideRule(a))) {
      const title = rule.frontmatter.title as string;
      assert.doesNotMatch(agentsMd, new RegExp(`^## ${escapeRegExp(title)}$`, 'm'), rule.id);
    }
    assert.deepEqual(filesUnder(files, '.opencode/skills/'), []);
  });

  it('should write every skill file byte-identical to Codex', async () => {
    const opencode = await compile();
    const codex = await compile(CODEX);
    const skillPaths = filesUnder(opencode, '.agents/skills/');

    assert.ok(skillPaths.length > 0, 'the compile wrote skills');
    assert.deepEqual(skillPaths.sort(), filesUnder(codex, '.agents/skills/').sort());
    for (const file of skillPaths) {
      assert.equal(opencode[file], codex[file], `different bytes for ${file}`);
    }
  });

  it('should carry every agent exactly, with only description, mode and permission', async () => {
    const catalog = await loadResolvedCatalog();
    const agents = catalog.artifacts.filter(a => a.kind === 'agent');
    assert.ok(agents.length > 0, 'the catalog has agents');

    for (const agent of agents) {
      const outcome = restrictionOutcome(OPENCODE_AGENT_SPEC, agent.frontmatter);
      assert.equal(outcome.kind, 'exact', agent.id);
    }

    const files = await compile();
    const agentFiles = filesUnder(files, '.opencode/agents/');
    assert.equal(agentFiles.length, agents.length);
    for (const file of agentFiles) {
      const { data } = parseFrontmatter(files[file]!);
      assert.deepEqual(Object.keys(data), ['description', 'mode', 'permission'], file);
    }
  });

  it('should keep the .env ask rule after the read allow rule, in every agent listing read', async () => {
    const catalog = await loadResolvedCatalog();
    const files = await compile();
    let checked = 0;

    for (const agent of catalog.artifacts.filter(a => a.kind === 'agent')) {
      const tools = (agent.frontmatter.tools as string[] | undefined) ?? [];
      if (!tools.includes('read')) continue;

      const file = `.opencode/agents/${agent.frontmatter.name as string}.md`;
      const { data } = parseFrontmatter(files[file]!);
      const read = data.permission.read as Record<string, string>;
      const keys = Object.keys(read);
      assert.ok(keys.includes('*'), `${file}: read has no '*' rule`);
      assert.ok(keys.includes('*.env'), `${file}: read has no '*.env' rule`);
      assert.ok(keys.indexOf('*') < keys.indexOf('*.env'), `${file}: '*.env' comes before '*'`);
      assert.equal(read['*'], 'allow', file);
      assert.equal(read['*.env'], 'ask', file);
      checked++;
    }

    assert.ok(checked > 0, 'the catalog has an agent listing read');
  });

  it('should leave no {sigil: token in any file', async () => {
    const files = await compile();
    for (const [file, content] of Object.entries(files)) {
      assert.doesNotMatch(content, /\{sigil:/, file);
    }
  });

  it('should pass every output contract, with the foreign literal forbids', async () => {
    const files = await compile();
    assert.deepEqual(checkOutputContract(files, contractsFor(getTarget(TARGET))), []);
  });

  it('should scaffold a rule as agents-standard does: a via rule has no file of its own', async () => {
    const catalog = await loadResolvedCatalog();
    const rule = catalog.artifacts.find(a => a.kind === 'rule')!;
    const scaffold = async (target: string): Promise<unknown> => {
      try {
        return await getTarget(target).scaffold!(rule.id, catalog, { projectDir: '.' });
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    };

    const opencode = await scaffold(TARGET);
    assert.deepEqual(opencode, await scaffold(PEER));
    assert.match(
      (opencode as { error: string }).error,
      /Scaffolding not supported for kind 'rule'/,
    );
  });

  it('should skip hook, settings and workflow ids, each with its reason', async () => {
    const catalog = await loadResolvedCatalog();
    const target = getTarget(TARGET);

    // The catalog holds no workflow artifact, so this kind gets a fixture to select.
    const workflow = {
      id: 'test/probe-workflow',
      kind: 'workflow',
      filePath: '/fake/probe.workflow.md',
      frontmatter: {
        id: 'test/probe-workflow',
        kind: 'workflow',
        title: 'Probe workflow',
        description: 'A probe workflow.',
      },
      body: 'Probe.',
    } as unknown as ResolvedArtifact;
    const withWorkflow: typeof catalog = {
      ...catalog,
      artifacts: [...catalog.artifacts, workflow],
      byId: new Map(catalog.byId).set(workflow.id, workflow),
    };

    const reasons: Record<string, RegExp> = {
      hook: /plugin API/,
      settings: /Claude Code's own vocabulary/,
      workflow: /no workflow file/,
    };
    const entries = (Object.keys(reasons) as ArtifactKind[]).map(kind => {
      const id =
        kind === 'workflow' ? workflow.id : catalog.artifacts.find(a => a.kind === kind)!.id;
      assert.ok(catalog.byId.has(id) || id === workflow.id, `the catalog has a ${kind}`);
      return { kind, id };
    });

    const result = resolveSelection({
      selectors: entries.map(e => `${e.kind}:${e.id}`),
      filters: {},
      catalog: withWorkflow,
      packs: [],
      supportedKinds: installableKinds(target),
      carriedKinds: carriedKinds(target),
      targetName: TARGET,
    });

    assert.deepEqual(result.ids, []);
    assert.deepEqual(
      result.skipped.map(s => s.id),
      entries.map(e => e.id),
    );
    for (const { kind, id } of entries) {
      const skipped = result.skipped.find(s => s.id === id)!;
      assert.equal(skipped.cause, 'kind', id);
      assert.match(skipped.reason, /not supported/, id);
      const support = kindSupport(target, kind);
      assert.equal(support?.mode, 'none', id);
      assert.match(support?.mode === 'none' ? support.reason : '', reasons[kind]!);
    }
  });

  it('should support no plugin channel', () => {
    const target = getTarget(TARGET);
    assert.equal(supportsKind(target, 'agent', 'plugin'), false);
    assert.equal(target.capabilities.plugin, undefined);
  });
});
