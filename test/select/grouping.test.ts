/**
 * Tests for src/select/grouping.ts — artifact grouping, availability, partitioning,
 * and language-option helpers.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../../dist-cli/load';
import { resolveCatalog } from '../../dist-cli/resolve';
import {
  groupArtifactsByLanguage,
  partitionConfigKinds,
  availableKinds,
  buildLanguageOptions,
  CONFIG_KINDS,
  KIND_ORDER,
} from '../../dist-cli/select/index';
import type { ResolvedArtifact } from '../../dist-cli/types';
import { CATALOG_DIR } from '../helpers/catalog';

// ─── groupArtifactsByLanguage ─────────────────────────────────────────────────

describe('groupArtifactsByLanguage', () => {
  it('buckets artifacts under their language, undefined-language under "shared"', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);

    const groups = groupArtifactsByLanguage(resolved.artifacts);

    // "shared" must be present (shared/clean-code, shared/code-reviewer, etc.)
    assert.ok('shared' in groups, '"shared" group present for language-undefined artifacts');

    // At least one real language group
    const realLanguages = Object.keys(groups).filter(k => k !== 'shared');
    assert.ok(realLanguages.length > 0, 'at least one language group');

    // Every artifact in "shared" has no language frontmatter
    for (const a of groups['shared']) {
      const lang = a.frontmatter.language as string | undefined;
      assert.equal(lang, undefined, `shared artifact ${a.id} must have no language`);
    }

    // Every artifact in a real language group matches that group key
    for (const lang of realLanguages) {
      for (const a of groups[lang]!) {
        assert.equal(
          a.frontmatter.language as string | undefined,
          lang,
          `artifact ${a.id} language frontmatter matches group key`,
        );
      }
    }
  });

  it('"shared" group is sorted last', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);

    const groups = groupArtifactsByLanguage(resolved.artifacts);
    const keys = Object.keys(groups);

    assert.equal(keys[keys.length - 1], 'shared', '"shared" is the last group key');
  });

  it('within each group, artifacts are sorted by kind then id', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);

    const groups = groupArtifactsByLanguage(resolved.artifacts);
    const kindOrder: string[] = KIND_ORDER;

    for (const [groupKey, arts] of Object.entries(groups)) {
      for (let i = 1; i < arts.length; i++) {
        const prev = arts[i - 1]!;
        const curr = arts[i]!;
        const prevKi = kindOrder.indexOf(prev.kind);
        const currKi = kindOrder.indexOf(curr.kind);
        const ok = currKi > prevKi || (currKi === prevKi && curr.id >= prev.id);
        assert.ok(
          ok,
          `In group "${groupKey}": ${prev.id} (${prev.kind}) should sort before ${curr.id} (${curr.kind})`,
        );
      }
    }
  });

  it('single-language filter includes that language + "shared", excludes others', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);

    const groups = groupArtifactsByLanguage(resolved.artifacts, 'csharp');
    const keys = Object.keys(groups);

    assert.ok('csharp' in groups, 'csharp group present');
    assert.ok('shared' in groups, '"shared" group present (always included)');

    // No other language groups
    const otherLangs = keys.filter(k => k !== 'csharp' && k !== 'shared');
    assert.equal(otherLangs.length, 0, `no other language groups: ${otherLangs.join(', ')}`);
  });
});

// ─── partitionConfigKinds ─────────────────────────────────────────────────────

describe('partitionConfigKinds', () => {
  it('CONFIG_KINDS contains exactly hook, settings, mcp', () => {
    assert.ok(CONFIG_KINDS.has('hook'));
    assert.ok(CONFIG_KINDS.has('settings'));
    assert.ok(CONFIG_KINDS.has('mcp'));
    assert.equal(CONFIG_KINDS.size, 3);
  });

  it('splits artifacts into config and rest partitions correctly', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const { config, rest } = partitionConfigKinds(resolved.artifacts);

    // config partition must contain only config kinds
    for (const a of config) {
      assert.ok(
        CONFIG_KINDS.has(a.kind),
        `config partition artifact ${a.id} must be a config kind (got ${a.kind})`,
      );
    }

    // config holds only language-agnostic config kinds; a language's own settings go to rest,
    // grouped with the rest of that language (shared/ holds only language-neutral content)
    for (const a of config) {
      assert.equal(a.frontmatter.language, undefined, `${a.id} in the agnostic config group`);
    }
    for (const a of rest.filter(a => CONFIG_KINDS.has(a.kind))) {
      assert.ok(a.frontmatter.language, `${a.id} is a config kind with no language`);
    }
    assert.ok(
      rest.some(a => a.id === 'csharp/cs-allow-dev-tools'),
      'a language settings artifact groups with its language',
    );

    // Union must cover the whole catalog (no artifact lost or duplicated)
    assert.equal(
      config.length + rest.length,
      resolved.artifacts.length,
      'partition covers all artifacts',
    );
  });

  it("groupArtifactsByLanguage on rest partition holds only that language's config kinds", async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const { rest } = partitionConfigKinds(resolved.artifacts);
    const groups = groupArtifactsByLanguage(rest);

    for (const [groupKey, arts] of Object.entries(groups)) {
      for (const a of arts.filter(a => CONFIG_KINDS.has(a.kind))) {
        assert.equal(
          a.frontmatter.language,
          groupKey,
          `Language group "${groupKey}" holds config artifact ${a.id} of another language`,
        );
      }
    }
  });

  it('config partition is sorted by KIND_ORDER then id', () => {
    const kindOrder: string[] = KIND_ORDER;
    const mockArtifacts = [
      { id: 'shared/b-mcp', kind: 'mcp', frontmatter: {}, body: '' },
      { id: 'shared/a-hook', kind: 'hook', frontmatter: {}, body: '' },
      { id: 'shared/a-mcp', kind: 'mcp', frontmatter: {}, body: '' },
      { id: 'csharp/skill-x', kind: 'skill', frontmatter: {}, body: '' }, // goes to rest
    ] as ResolvedArtifact[];

    const { config } = partitionConfigKinds(mockArtifacts);
    // hook before mcp (kind order), then within mcp: a-mcp before b-mcp (alpha)
    assert.equal(config.length, 3);
    assert.equal(config[0]!.kind, 'hook');
    assert.equal(config[1]!.id, 'shared/a-mcp');
    assert.equal(config[2]!.id, 'shared/b-mcp');

    // Verify stable sort
    for (let i = 1; i < config.length; i++) {
      const prev = config[i - 1]!;
      const curr = config[i]!;
      const pi = kindOrder.indexOf(prev.kind);
      const ci = kindOrder.indexOf(curr.kind);
      const ok = ci > pi || (ci === pi && curr.id >= prev.id);
      assert.ok(ok, `config[${i - 1}] (${prev.id}) should sort before config[${i}] (${curr.id})`);
    }
  });
});

// ─── availableKinds ────────────────────────────────────────────────────────────

describe('availableKinds', () => {
  it('returns present kinds in KIND_ORDER', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const kinds = availableKinds(resolved.artifacts);
    // Must be a subset of KIND_ORDER — skill comes before agent, etc.
    const kindOrder: string[] = KIND_ORDER;
    for (let i = 0; i < kinds.length - 1; i++) {
      assert.ok(
        kindOrder.indexOf(kinds[i]!) < kindOrder.indexOf(kinds[i + 1]!),
        `kind order: ${kinds[i]} should precede ${kinds[i + 1]}`,
      );
    }
  });

  it('excludes kinds not present in the artifact list', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    // Skills only
    const skillsOnly = resolved.artifacts.filter(a => a.kind === 'skill');
    const kinds = availableKinds(skillsOnly);
    assert.deepEqual(kinds, ['skill'], 'only skill kind present');
  });

  it('returns empty array for empty list', () => {
    assert.deepEqual(availableKinds([]), []);
  });
});

// ─── buildLanguageOptions ──────────────────────────────────────────────────────

describe('buildLanguageOptions (array-based)', () => {
  it('returns [] when no language-tagged artifacts', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const sharedOnly = resolved.artifacts.filter(a => !a.frontmatter.language);
    assert.deepEqual(buildLanguageOptions(sharedOnly), []);
  });

  it('includes All languages option + one per language with count', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const opts = buildLanguageOptions(resolved.artifacts);
    assert.ok(opts.length >= 2, 'at least All + 1 language');
    assert.equal(opts[0]!.value, '', 'first option is All languages');
    assert.ok(
      opts.slice(1).every(o => o.hint.match(/\d+ artifact/)),
      'each language has count hint',
    );
  });

  it('counts reflect the passed subset, not the whole catalog', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    // Only csharp artifacts
    const csharpOnly = resolved.artifacts.filter(a => a.frontmatter.language === 'csharp');
    const opts = buildLanguageOptions(csharpOnly);
    // Only csharp should appear (no python, react)
    const langs = opts.slice(1).map(o => o.value);
    assert.ok(
      langs.every(l => l === 'csharp'),
      'only csharp in subset options',
    );
    // Count in hint matches actual csharp artifacts
    const csharpOpt = opts.find(o => o.value === 'csharp');
    assert.ok(csharpOpt?.hint.startsWith(`${csharpOnly.length} artifact`), 'count matches subset');
  });
});
