/**
 * The open-standard target (`agents-standard`): Agent Skills in `.agents/skills/` per the Agent Skills
 * spec, rules carried inside skills, and a root AGENTS.md with repo-wide rules on a full build.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getTarget } from '../../dist-cli/targets/index';
import { parseFrontmatter } from '../../dist-cli/frontmatter-parse';
import { renderArtifact } from '../../dist-cli/targets/emit';
import { loadResolvedCatalog } from '../helpers/catalog';
import { withTempDirAsync } from '../helpers/temp-dir';
import { CATALOG, PACKS } from '../helpers/install-scenario';
import { runAdd } from '../../dist-cli/commands/add';
import { resolveSelection } from '../../dist-cli/select/selector-resolve';
import { computeClosure } from '../../dist-cli/select/closure';
import { carriedKinds, installableKinds } from '../../dist-cli/targets/capabilities';

const TARGET = 'agents-standard';
const SKILL = 'typescript/ts-generate-tests'; // uses rules, so they get inlined
const REPO_WIDE_RULE = 'shared/clean-code';

async function add(dir: string, selectors: string[]): Promise<void> {
  await runAdd(selectors, {
    projectDir: dir,
    catalogDir: CATALOG,
    packs: PACKS,
    target: TARGET,
    deps: true,
    dryRun: false,
    interactive: false,
    yes: true,
    overwrite: false,
    settingsLocal: false,
  });
}

describe('agents-standard target', () => {
  it('should write a skill to .agents/skills with only Agent Skills spec frontmatter', async () => {
    const catalog = await loadResolvedCatalog();
    const files = await getTarget(TARGET).scaffold!(SKILL, catalog, { projectDir: '.' });
    const skillFile = Object.keys(files).find(f => f.endsWith('/SKILL.md'))!;
    assert.match(skillFile, /^\.agents\/skills\/[a-z0-9-]+\/SKILL\.md$/);
    const { data, content } = parseFrontmatter(files[skillFile]!);
    for (const key of Object.keys(data)) {
      assert.ok(['name', 'description', 'allowed-tools'].includes(key), `unexpected key ${key}`);
    }
    assert.match(content, /## Coding guidelines to apply/); // the skill's rules, inlined
    assert.ok(
      Object.keys(files).every(f => f.startsWith('.agents/skills/')),
      'no rule files',
    );
  });

  it('should write allowed-tools as the spec does: one space-separated string', async () => {
    const catalog = await loadResolvedCatalog();
    const withTools = catalog.artifacts.find(
      a =>
        a.kind === 'skill' &&
        ((a.frontmatter.allowedTools as string[] | undefined) ?? []).length > 1,
    )!;
    const files = await getTarget(TARGET).scaffold!(withTools.id, catalog, { projectDir: '.' });
    const skill = Object.entries(files).find(([f]) => f.endsWith('/SKILL.md'))![1];
    const tools = (withTools.frontmatter.allowedTools as string[]).join(' ');
    // One space-separated string, quoted so a value starting with `*` or holding `:` stays valid YAML.
    assert.ok(skill.split('\n').includes(`allowed-tools: "${tools}"`), skill.slice(0, 300));
    assert.equal(parseFrontmatter(skill).data['allowed-tools'], tools);
  });

  it('should refuse a tool name the space-separated list cannot carry', async () => {
    const catalog = await loadResolvedCatalog();
    const base = catalog.artifacts.find(a => a.kind === 'skill')!;
    const spaced = {
      ...base,
      frontmatter: { ...base.frontmatter, allowedTools: ['Read', 'Bash(git log *)'] },
    };
    const spec = getTarget(TARGET).emitSpecs!.find(s => s.kind === 'skill')!;
    assert.throws(() => renderArtifact(spec, spaced, { catalog }), /Bash\(git log \*\)/);
  });

  it('should write repo-wide rules to a root AGENTS.md on a full build', async () => {
    const catalog = await loadResolvedCatalog();
    const files = await getTarget(TARGET).compile(catalog, { version: '0.0.0', packs: [] });
    const agentsMd = files['AGENTS.md'] ?? '';
    const rule = catalog.byId.get(REPO_WIDE_RULE)!;
    assert.match(agentsMd, new RegExp(`## ${rule.frontmatter.title as string}`));
    assert.doesNotMatch(agentsMd, /\{sigil:/);
  });

  it('should skip a rule picked on its own, saying it travels inside skills', async () => {
    const catalog = await loadResolvedCatalog();
    const target = getTarget(TARGET);
    const result = resolveSelection({
      selectors: [`skill:${SKILL}`, `rule:${REPO_WIDE_RULE}`],
      filters: {},
      catalog,
      packs: [],
      supportedKinds: installableKinds(target),
      carriedKinds: carriedKinds(target),
      targetName: TARGET,
    });
    assert.deepEqual(result.ids, [SKILL]);
    assert.deepEqual(
      result.skipped.map(s => s.id),
      [REPO_WIDE_RULE],
    );
    assert.match(result.skipped[0]!.reason, /inside the skills/);
  });

  it('should offer no separate helpers for rules the skill carries inside', async () => {
    const catalog = await loadResolvedCatalog();
    const forClaude = computeClosure([SKILL], catalog, getTarget('claude')).dependencies;
    const forStandard = computeClosure([SKILL], catalog, getTarget(TARGET)).dependencies;
    assert.ok(
      forClaude.some(d => d.artifact.kind === 'rule'),
      'Claude installs the rules',
    );
    assert.ok(!forStandard.some(d => d.artifact.kind === 'rule'), 'rules ride inside the skill');
  });

  it('should install the skill and record only it, with its rules inside', async () => {
    await withTempDirAsync(async dir => {
      await add(dir, [`skill:${SKILL}`, `rule:${REPO_WIDE_RULE}`]);
      const skills = fs.readdirSync(path.join(dir, '.agents', 'skills'));
      assert.equal(skills.length, 1);
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.sigil/manifest.json'), 'utf8'));
      assert.deepEqual(
        manifest.entries.map((e: { id: string }) => e.id),
        [SKILL],
      );
    });
  });
});
