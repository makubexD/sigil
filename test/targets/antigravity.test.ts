/**
 * The Antigravity target writes Agent Skills to `.agents/skills/`, the same files the
 * agents-standard target writes, and repo-wide rules as always-on `.agents/rules/` files. A scoped
 * rule is skipped by the rule spec's `skipReason` (ADR probe B1). Every kind it has no spec for is
 * skipped with the reason its capability table declares.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAllTargets, getTarget } from '../../dist-cli/targets/index';
import { parseFrontmatter } from '../../dist-cli/frontmatter-parse';
import { loadResolvedCatalog } from '../helpers/catalog';
import { resolveSelection } from '../../dist-cli/select/selector-resolve';
import { carriedKinds, installableKinds, kindSupport } from '../../dist-cli/targets/capabilities';
import { wholeFileSkipReason } from '../../dist-cli/targets/tool-restriction';
import { appliesToEveryFile } from '../../dist-cli/targets/shared/repo-wide-rules';
import type { ArtifactKind } from '../../dist-cli/types';

const TARGET = 'antigravity';
const AGENTS_STANDARD = 'agents-standard';
const SKILL = 'typescript/ts-generate-tests'; // uses rules, so they get inlined
const SHARED_SKILL = 'shared/cli'; // carries reference files and inlined rules
const REPO_WIDE_RULE = 'shared/clean-code';
const SCOPED_RULE = 'shared/cli-rules';

/** The SKILL.md content a scaffold wrote. */
function skillContent(files: Record<string, string>): string {
  const file = Object.keys(files).find(f => f.endsWith('/SKILL.md'));
  assert.ok(file, 'the scaffold wrote a SKILL.md');
  return files[file]!;
}

describe('antigravity target', () => {
  it('should scaffold the same skill files as agents-standard, byte for byte', async () => {
    const catalog = await loadResolvedCatalog();
    const antigravity = await getTarget(TARGET).scaffold!(SKILL, catalog, { projectDir: '.' });
    const standard = await getTarget(AGENTS_STANDARD).scaffold!(SKILL, catalog, {
      projectDir: '.',
    });

    const skillFiles = (files: Record<string, string>): Record<string, string> =>
      Object.fromEntries(
        Object.entries(files).filter(([file]) => !file.startsWith('.agents/agents/')),
      );

    assert.deepEqual(skillFiles(antigravity), standard);
  });

  it('should inline the skill rules instead of writing .agents/rules files', async () => {
    const catalog = await loadResolvedCatalog();
    const files = await getTarget(TARGET).scaffold!(SHARED_SKILL, catalog, { projectDir: '.' });

    assert.ok(
      Object.keys(files).every(f => !f.startsWith('.agents/rules/')),
      'no .agents/rules/ file',
    );
    assert.match(skillContent(files), /## Coding guidelines to apply/);
  });

  it('should scaffold a repo-wide rule as an always-on .agents/rules file', async () => {
    const catalog = await loadResolvedCatalog();
    const files = await getTarget(TARGET).scaffold!(REPO_WIDE_RULE, catalog, { projectDir: '.' });

    assert.deepEqual(Object.keys(files), ['.agents/rules/shared-clean-code.md']);
    const content = files['.agents/rules/shared-clean-code.md']!;
    assert.match(content, /^trigger: always_on$/m);
    assert.match(content, /^description: /m);
    assert.doesNotMatch(content, /^globs:/m);

    const data = parseFrontmatter(content).data;
    assert.equal(data.trigger, 'always_on');
    assert.equal(typeof data.description, 'string');
    assert.equal(data.globs, undefined);
  });

  it('should skip a scoped rule with the probe B1 reason', async () => {
    const catalog = await loadResolvedCatalog();
    const target = getTarget(TARGET);

    const result = resolveSelection({
      selectors: [`rule:${SCOPED_RULE}`],
      filters: {},
      catalog,
      packs: [],
      supportedKinds: installableKinds(target),
      carriedKinds: carriedKinds(target),
      targetName: TARGET,
      skipReason: a => wholeFileSkipReason(target, a),
    });

    assert.deepEqual(result.ids, []);
    assert.deepEqual(
      result.skipped.map(s => s.id),
      [SCOPED_RULE],
    );
    const skipped = result.skipped[0]!;
    assert.equal(skipped.kind, 'rule');
    assert.equal(skipped.cause, 'unrenderable');
    assert.match(skipped.reason, /ADR probe B1/);
  });

  it('should skip a prompt and a hook, with the reason its capability row gives', async () => {
    const catalog = await loadResolvedCatalog();
    const target = getTarget(TARGET);

    const reasons: Record<string, RegExp> = {
      prompt: /no prompt files/,
      hook: /Phase E/,
    };
    for (const kind of Object.keys(reasons) as ArtifactKind[]) {
      const artifact = catalog.artifacts.find(a => a.kind === kind);
      assert.ok(artifact, `the catalog has a ${kind}`);

      const result = resolveSelection({
        selectors: [`${kind}:${artifact.id}`],
        filters: {},
        catalog,
        packs: [],
        supportedKinds: installableKinds(target),
        carriedKinds: carriedKinds(target),
        targetName: TARGET,
      });

      assert.deepEqual(result.ids, []);
      assert.deepEqual(
        result.skipped.map(s => s.id),
        [artifact.id],
      );
      const skipped = result.skipped[0]!;
      assert.equal(skipped.kind, kind);
      assert.equal(skipped.cause, 'kind');
      assert.match(skipped.reason, /not supported/);

      const support = kindSupport(target, kind);
      assert.equal(support?.mode, 'none');
      assert.match(support.mode === 'none' ? support.reason : '', reasons[kind]!);
    }
  });

  it('should compile .agents/skills and no other target’s files', async () => {
    const catalog = await loadResolvedCatalog();
    const files = await getTarget(TARGET).compile(catalog, { version: '0.0.0', packs: [] });
    const keys = Object.keys(files);

    assert.ok(
      keys.some(f => f.startsWith('.agents/skills/')),
      'skills are written',
    );
    assert.ok(
      keys.every(f => f !== 'AGENTS.md'),
      'no AGENTS.md',
    );
    assert.ok(
      keys.every(
        f => !f.startsWith('.claude/') && !f.startsWith('.github/') && !f.startsWith('.cursor/'),
      ),
      'no other target’s file',
    );
  });

  it('should compile one .agents/rules file per repo-wide rule and none for a scoped one', async () => {
    const catalog = await loadResolvedCatalog();
    const files = await getTarget(TARGET).compile(catalog, { version: '0.0.0', packs: [] });

    const isRepoWide = (a: (typeof catalog.artifacts)[number]): boolean =>
      appliesToEveryFile(a.frontmatter.appliesTo as string[] | undefined);
    const rules = catalog.artifacts.filter(a => a.kind === 'rule');
    const repoWide = rules.filter(isRepoWide);
    const scoped = rules.filter(a => !isRepoWide(a));
    assert.ok(repoWide.length > 0, 'the catalog has repo-wide rules');
    assert.ok(scoped.length > 0, 'the catalog has scoped rules');

    const ruleFiles = Object.keys(files).filter(f => f.startsWith('.agents/rules/'));
    assert.equal(ruleFiles.length, repoWide.length, 'one file per repo-wide rule');

    for (const rule of repoWide) {
      const path = `.agents/rules/${rule.id.replace(/\//g, '-')}.md`;
      assert.ok(files[path], `Antigravity writes ${path}`);
    }
    for (const rule of scoped) {
      const path = `.agents/rules/${rule.id.replace(/\//g, '-')}.md`;
      assert.ok(!files[path], `Antigravity writes no ${path}`);
    }
    assert.ok(!ruleFiles.some(f => f.endsWith('shared-cli-rules.md')), 'no shared-cli-rules.md');
  });

  it('should be registered as antigravity, right after cursor', () => {
    assert.equal(getTarget(TARGET).name, TARGET);

    const names = getAllTargets().map(t => t.name);
    const cursor = names.indexOf('cursor');
    assert.ok(cursor >= 0, 'cursor is registered');
    assert.equal(names[cursor + 1], TARGET);
  });
});
