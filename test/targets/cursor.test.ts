/**
 * The Cursor target writes Agent Skills to `.cursor/skills/` and nothing else yet. Its skills are
 * the Codex target's `.agents/skills/` files with the folder renamed, and every kind it has no
 * spec for is skipped with the reason its capability table declares.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAllTargets, getTarget } from '../../dist-cli/targets/index';
import { parseFrontmatter } from '../../dist-cli/frontmatter-parse';
import { loadResolvedCatalog } from '../helpers/catalog';
import { resolveSelection } from '../../dist-cli/select/selector-resolve';
import { carriedKinds, installableKinds, kindSupport } from '../../dist-cli/targets/capabilities';
import { resolveCatalog } from '../../dist-cli/resolve';
import type { Artifact, LoadedCatalog, ResolvedCatalog } from '../../dist-cli/types';

const TARGET = 'cursor';
const CODEX = 'codex';
const SKILL = 'typescript/ts-generate-tests'; // uses rules, so they get inlined
const SHARED_SKILL = 'shared/cli'; // carries reference files and inlined rules

/** Paths in `files` under `prefix`, with the prefix stripped and the list sorted. */
function under(files: Record<string, string>, prefix: string): string[] {
  return Object.keys(files)
    .filter(f => f.startsWith(prefix))
    .map(f => f.slice(prefix.length))
    .sort();
}

/** The SKILL.md content a scaffold wrote. */
function skillContent(files: Record<string, string>): string {
  const file = Object.keys(files).find(f => f.endsWith('/SKILL.md'));
  assert.ok(file, 'the scaffold wrote a SKILL.md');
  return files[file]!;
}

describe('cursor target', () => {
  it('should scaffold the same skill files as codex, under .cursor/skills', async () => {
    const catalog = await loadResolvedCatalog();
    const cursor = await getTarget(TARGET).scaffold!(SKILL, catalog, { projectDir: '.' });
    const codex = await getTarget(CODEX).scaffold!(SKILL, catalog, { projectDir: '.' });

    assert.deepEqual(under(cursor, '.cursor/skills/'), under(codex, '.agents/skills/'));
  });

  it('should write the same SKILL.md frontmatter as codex', async () => {
    const catalog = await loadResolvedCatalog();
    const cursor = await getTarget(TARGET).scaffold!(SKILL, catalog, { projectDir: '.' });
    const codex = await getTarget(CODEX).scaffold!(SKILL, catalog, { projectDir: '.' });

    assert.deepEqual(
      parseFrontmatter(skillContent(cursor)).data,
      parseFrontmatter(skillContent(codex)).data,
    );
  });

  it('should inline the skill rules instead of writing .cursor/rules files', async () => {
    const catalog = await loadResolvedCatalog();
    const files = await getTarget(TARGET).scaffold!(SHARED_SKILL, catalog, { projectDir: '.' });

    assert.ok(
      Object.keys(files).every(f => !f.startsWith('.cursor/rules/')),
      'no .cursor/rules/ file',
    );
    assert.match(skillContent(files), /## Coding guidelines to apply/);
  });

  it('should skip an agent and a prompt, with the reason its capability row gives', async () => {
    const catalog = await loadResolvedCatalog();
    const target = getTarget(TARGET);

    const reasons = {
      agent: /no tool list.*readonly: true/,
      prompt: /folding commands into skills/,
    };
    for (const kind of ['agent', 'prompt'] as const) {
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
      assert.match(support.mode === 'none' ? support.reason : '', reasons[kind]);
    }
  });

  it('should compile .cursor/skills and no other target’s files', async () => {
    const catalog = await loadResolvedCatalog();
    const files = await getTarget(TARGET).compile(catalog, { version: '0.0.0', packs: [] });
    const keys = Object.keys(files);

    assert.ok(
      keys.some(f => f.startsWith('.cursor/skills/')),
      'skills are written',
    );
    assert.ok(
      keys.every(f => f !== 'AGENTS.md'),
      'no AGENTS.md',
    );
    assert.ok(
      keys.every(
        f => !f.startsWith('.agents/') && !f.startsWith('.claude/') && !f.startsWith('.github/'),
      ),
      'no other target’s file',
    );
  });

  it('should be registered as cursor, right after codex', () => {
    assert.equal(getTarget(TARGET).name, TARGET);

    const names = getAllTargets().map(t => t.name);
    const codex = names.indexOf(CODEX);
    assert.ok(codex >= 0, 'codex is registered');
    assert.equal(names[codex + 1], TARGET);
  });
});

/** A one-rule resolved catalog, built the way resolve.test.ts builds in-memory catalogs. */
function makeRuleCatalog(frontmatter: Record<string, unknown>): ResolvedCatalog {
  const artifact: Artifact = {
    id: 'shared/test-rule',
    kind: 'rule',
    filePath: '/fake/catalog/shared/rules/test-rule.rule.md',
    frontmatter: { kind: 'rule', ...frontmatter },
    body: 'Test rule body.',
  };
  const loaded: LoadedCatalog = {
    artifacts: [artifact],
    byId: new Map([[artifact.id, artifact]]),
    languages: new Map(),
    skipWarnings: [],
  };
  return resolveCatalog(loaded);
}

/** The one `.mdc` a cursor rule scaffold wrote, plus its raw text. */
function cursorRule(files: Record<string, string>): { file: string; raw: string } {
  const file = Object.keys(files).find(f => f.startsWith('.cursor/rules/') && f.endsWith('.mdc'));
  assert.ok(file, 'the scaffold wrote a .cursor/rules/*.mdc file');
  return { file, raw: files[file]! };
}

describe('cursor rules', () => {
  it('should write a repo-wide rule as alwaysApply with no globs', async () => {
    const catalog = await loadResolvedCatalog();
    const files = await getTarget(TARGET).scaffold!('shared/git', catalog, { projectDir: '.' });
    const { file, raw } = cursorRule(files);

    assert.equal(file, '.cursor/rules/shared-git.mdc');
    const { data } = parseFrontmatter(raw);
    assert.ok(data.description, 'description is present');
    assert.equal(data.alwaysApply, true);
    assert.ok(!('globs' in data), 'no globs key');
  });

  it('should write a scoped rule with a quoted, comma-joined globs list', async () => {
    const catalog = await loadResolvedCatalog();
    const files = await getTarget(TARGET).scaffold!('typescript/ts-async', catalog, {
      projectDir: '.',
    });
    const { raw } = cursorRule(files);

    const { data } = parseFrontmatter(raw);
    assert.equal(data.globs, '**/*.ts,**/*.tsx');
    assert.equal(data.alwaysApply, false);
    assert.ok(data.description, 'description is present');
    assert.ok(raw.includes('globs: "**/*.ts,**/*.tsx"'), 'globs is emitted as a quoted scalar');
  });

  it('should scope a language rule to all four of its appliesTo globs, not widen it', async () => {
    const catalog = await loadResolvedCatalog();
    const files = await getTarget(TARGET).scaffold!('typescript/ts-git', catalog, {
      projectDir: '.',
    });
    const { raw } = cursorRule(files);

    const { data } = parseFrontmatter(raw);
    const artifact = catalog.byId.get('typescript/ts-git');
    assert.ok(artifact, 'typescript/ts-git is in the catalog');
    const appliesTo = artifact.frontmatter.appliesTo as string[];

    assert.equal(appliesTo.length, 4);
    assert.equal(data.alwaysApply, false);
    assert.deepEqual(String(data.globs).split(','), appliesTo);
  });

  it('should treat appliesTo ["**"] as repo-wide', async () => {
    const catalog = makeRuleCatalog({
      title: 'Repo-wide test rule',
      description: 'Applies to every file.',
      appliesTo: ['**'],
    });
    const files = await getTarget(TARGET).scaffold!('shared/test-rule', catalog, {
      projectDir: '.',
    });
    const { raw } = cursorRule(files);

    assert.equal(parseFrontmatter(raw).data.alwaysApply, true);
  });

  it('should round-trip a description holding a colon and a quote', async () => {
    const description = 'Use when: you say "hi"';
    const catalog = makeRuleCatalog({
      title: 'Quoted description rule',
      description,
      appliesTo: ['**/*.ts'],
    });
    const files = await getTarget(TARGET).scaffold!('shared/test-rule', catalog, {
      projectDir: '.',
    });
    const { raw } = cursorRule(files);

    assert.equal(parseFrontmatter(raw).data.description, description);
  });

  it('should compile one .mdc per catalog rule, and no AGENTS.md', async () => {
    const catalog = await loadResolvedCatalog();
    const files = await getTarget(TARGET).compile(catalog, { version: '0.0.0', packs: [] });
    const keys = Object.keys(files);
    // Copilot's compile emits every rule artifact (no deprecated filter), so this is the same count.
    const ruleCount = catalog.artifacts.filter(a => a.kind === 'rule').length;

    assert.ok(ruleCount > 0, 'the catalog has rules');
    assert.equal(keys.filter(f => /^\.cursor\/rules\/.*\.mdc$/.test(f)).length, ruleCount);
    assert.ok(
      keys.every(f => f !== 'AGENTS.md'),
      'no AGENTS.md',
    );
  });
});
