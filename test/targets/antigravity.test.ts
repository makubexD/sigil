/**
 * The Antigravity target writes Agent Skills to `.agents/skills/`, the same files the
 * agents-standard target writes, and repo-wide rules as always-on `.agents/rules/` files. A scoped
 * rule is skipped by the rule spec's `skipReason` (ADR probe B1). Every kind it has no spec for is
 * skipped with the reason its capability table declares.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getAllTargets, getTarget } from '../../dist-cli/targets/index';
import { parseFrontmatter } from '../../dist-cli/frontmatter-parse';
import { loadResolvedCatalog } from '../helpers/catalog';
import { resolveSelection } from '../../dist-cli/select/selector-resolve';
import {
  carriedKinds,
  installableKinds,
  kindSupport,
  supportsKind,
} from '../../dist-cli/targets/capabilities';
import { wholeFileSkipReason } from '../../dist-cli/targets/tool-restriction';
import { appliesToEveryFile } from '../../dist-cli/targets/shared/repo-wide-rules';
import { parsePacksConfig } from '../../dist-cli/packs-config';
import { PACKS as BUNDLED_PACKS } from '../helpers/install-scenario';
import type { ArtifactKind, Pack } from '../../dist-cli/types';

const TARGET = 'antigravity';
const AGENTS_STANDARD = 'agents-standard';
const SKILL = 'typescript/ts-generate-tests'; // uses rules, so they get inlined
const SHARED_SKILL = 'shared/cli'; // carries reference files and inlined rules
const REPO_WIDE_RULE = 'shared/clean-code';
const SCOPED_RULE = 'shared/cli-rules';
const PROJECT_DIR = '/abs/project';
const PROTECT_CONFIG = 'shared/protect-config';
const WORKER_GUARD = 'shared/worker-mode-guard';

/** The real `packs.yaml`, parsed once per call — the build's pack membership. */
function realPacks(): Pack[] {
  return parsePacksConfig(fs.readFileSync(BUNDLED_PACKS, 'utf8'), BUNDLED_PACKS).packs;
}

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

  it('should skip a prompt, with the reason its capability row gives', async () => {
    const catalog = await loadResolvedCatalog();
    const target = getTarget(TARGET);

    const reasons: Record<string, RegExp> = {
      prompt: /no prompt files/,
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

  it('should support hooks on the scaffold channel', () => {
    assert.equal(supportsKind(getTarget(TARGET), 'hook'), true);
  });

  it('should offer project then user for hooks, naming both config files', () => {
    const scopes = getTarget(TARGET).configScopes!(['hook'], PROJECT_DIR);

    assert.deepEqual(
      scopes.map(scope => scope.value),
      ['project', 'user'],
    );
    assert.deepEqual(
      scopes.map(scope => scope.description),
      [
        'project — .agents/hooks.json and .agents/mcp_config.json, git-committed',
        'user — ~/.gemini/config/hooks.json and ~/.gemini/config/mcp_config.json, all projects',
      ],
    );
    assert.deepEqual(
      scopes.map(scope => scope.destinations[0]!.file),
      ['.agents/hooks.json', '.gemini/config/hooks.json'],
    );
    assert.deepEqual(
      scopes.map(scope => scope.destinations[0]!.root),
      ['project', 'home'],
    );
    for (const scope of scopes) {
      assert.deepEqual(
        scope.destinations.map(destination => destination.kind),
        ['hook'],
      );
      assert.equal(scope.destinations[0]!.section, '(hook name)');
    }
  });

  it('should scaffold shared/protect-config as one named hook entry', async () => {
    const catalog = await loadResolvedCatalog();
    const ops = await getTarget(TARGET).scaffoldConfig!(PROTECT_CONFIG, catalog, {
      projectDir: PROJECT_DIR,
      scope: 'project',
    });

    assert.equal(ops.length, 1);
    const op = ops[0]!;
    assert.equal(op.file, '.agents/hooks.json');
    assert.equal(op.root, 'project');
    assert.deepEqual(Object.keys(op.fragment), ['shared-protect-config']);
    assert.ok((op.fragment['shared-protect-config'] as Record<string, unknown>).PreToolUse);
  });

  it('should render shared/worker-mode-guard but never offer it, since it is Claude-only', async () => {
    const catalog = await loadResolvedCatalog();
    const target = getTarget(TARGET);

    assert.equal(target.configSkipReason!(catalog.byId.get(WORKER_GUARD)!), undefined);

    const result = resolveSelection({
      selectors: [`hook:${WORKER_GUARD}`],
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
      [WORKER_GUARD],
    );
    assert.equal(result.skipped[0]!.cause, 'platform');
  });

  it('should compile a plugin layout and no scaffold files', async () => {
    const catalog = await loadResolvedCatalog();
    const files = await getTarget(TARGET).compile(catalog, {
      version: '0.0.0',
      packs: realPacks(),
    });
    const keys = Object.keys(files);

    assert.ok(keys.length > 0, 'the build writes files');
    assert.ok(
      keys.every(f => f.startsWith('plugins/')),
      'every build file lives in a plugin folder',
    );
    assert.ok(
      keys.every(f => !f.startsWith('.agents/') && f !== 'AGENTS.md'),
      'no scaffold file',
    );
  });

  it('should compile no rules file for a scoped rule', async () => {
    const catalog = await loadResolvedCatalog();
    const files = await getTarget(TARGET).compile(catalog, {
      version: '0.0.0',
      packs: realPacks(),
    });

    const isRepoWide = (a: (typeof catalog.artifacts)[number]): boolean =>
      appliesToEveryFile(a.frontmatter.appliesTo as string[] | undefined);
    const scoped = catalog.artifacts.filter(a => a.kind === 'rule' && !isRepoWide(a));
    assert.ok(scoped.length > 0, 'the catalog has scoped rules');

    const ruleFiles = Object.keys(files).filter(f => /\/rules\/[^/]*\.md$/.test(f));
    for (const rule of scoped) {
      const name = `${rule.id.replace(/\//g, '-')}.md`;
      assert.ok(!ruleFiles.some(f => f.endsWith(`/rules/${name}`)), `no file for ${rule.id}`);
    }
    assert.ok(!ruleFiles.some(f => f.endsWith('/rules/shared-cli-rules.md')));
  });

  it('should be registered as antigravity, right after cursor', () => {
    assert.equal(getTarget(TARGET).name, TARGET);

    const names = getAllTargets().map(t => t.name);
    const cursor = names.indexOf('cursor');
    assert.ok(cursor >= 0, 'cursor is registered');
    assert.equal(names[cursor + 1], TARGET);
  });
});
