/**
 * Tests for src/select/index.ts — resolveSelection, artifactLanguage, isAgnostic.
 * (Parts of the R block dealing with selection logic, not wizard navigation.)
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { resolveCatalog } from '../../dist-cli/resolve';
import {
  resolveSelection,
  computeClosure,
  CONFIG_KINDS,
  artifactLanguage,
  isAgnostic,
} from '../../dist-cli/select/index';
import { loadBundledCatalog } from '../helpers/catalog';
import type { ResolvedCatalog } from '../../dist-cli/types';

const PACKS_CURATED = [
  {
    name: 'essentials',
    displayName: 'Essentials (any language)',
    description: 'Core productivity tools',
    artifacts: [
      'shared/filesystem',
      'shared/protect-config',
      'shared/allow-dev-tools',
      'shared/explain-diff',
      'shared/author-artifact',
    ],
  },
  {
    name: 'react-starter',
    displayName: 'React Starter',
    description: 'React development setup',
    artifacts: [
      'react/react-generate-tests',
      'shared/filesystem',
      'shared/protect-config',
      'shared/allow-dev-tools',
    ],
  },
];

describe('R — resolveSelection / language helpers', () => {
  let resolvedCatalog: ResolvedCatalog;

  beforeEach(async () => {
    const cat = await loadBundledCatalog();
    resolvedCatalog = resolveCatalog(cat) as ResolvedCatalog;
  });

  it('should skip every candidate when the target supports no kinds (empty list is not a wildcard)', () => {
    const { ids, skipped } = resolveSelection({
      selectors: ['pack:essentials'],
      filters: {},
      catalog: resolvedCatalog,
      packs: PACKS_CURATED,
      supportedKinds: [],
    });

    assert.deepEqual(ids, []);
    assert.equal(skipped.length, 5);
  });

  it('resolveSelection pack:essentials returns exactly the 5 agnostic artifact IDs', () => {
    const { ids } = resolveSelection({
      selectors: ['pack:essentials'],
      filters: {},
      catalog: resolvedCatalog,
      packs: PACKS_CURATED,
    });
    const expected = [
      'shared/filesystem',
      'shared/protect-config',
      'shared/allow-dev-tools',
      'shared/explain-diff',
      'shared/author-artifact',
    ];
    assert.deepEqual(
      [...ids].sort(),
      [...expected].sort(),
      'essentials pack must expand to exactly the 5 agnostic artifacts',
    );
  });

  it('resolveSelection pack:react-starter returns the 4 primary artifact IDs', () => {
    const { ids } = resolveSelection({
      selectors: ['pack:react-starter'],
      filters: {},
      catalog: resolvedCatalog,
      packs: PACKS_CURATED,
    });
    const expected = [
      'react/react-generate-tests',
      'shared/filesystem',
      'shared/protect-config',
      'shared/allow-dev-tools',
    ];
    assert.deepEqual(
      [...ids].sort(),
      [...expected].sort(),
      'react-starter must expand to the skill + 3 config artifacts',
    );
  });

  it('computeClosure for react-starter primary IDs adds rule + React code-reviewer as deps', () => {
    const { ids } = resolveSelection({
      selectors: ['pack:react-starter'],
      filters: {},
      catalog: resolvedCatalog,
      packs: PACKS_CURATED,
    });
    const cp = computeClosure(ids, resolvedCatalog);
    const depIds = cp.dependencies.map(d => d.artifact.id);
    assert.ok(
      depIds.includes('react/react-testing'),
      'react-starter closure must include react/react-testing (via skill uses.rules)',
    );
    assert.ok(
      depIds.includes('react/react-code-reviewer'),
      'react-starter closure must include react/react-code-reviewer (via skill uses.agents)',
    );
  });

  it('language filter on "all" keeps every config/agnostic artifact', () => {
    const { ids } = resolveSelection({
      selectors: ['all'],
      filters: { language: 'react' },
      catalog: resolvedCatalog,
      packs: PACKS_CURATED,
    });
    // Every agnostic config kind survives the react filter; a language's own config artifact
    // survives only its language's filter.
    const configs = resolvedCatalog.artifacts.filter(a => CONFIG_KINDS.has(a.kind));
    for (const a of configs.filter(a => isAgnostic(a))) {
      assert.ok(ids.includes(a.id), `${a.id} must survive the react language filter (agnostic)`);
    }
    assert.ok(ids.includes('react/react-allow-dev-tools'), 'react keeps its own settings');
    assert.ok(!ids.includes('csharp/cs-allow-dev-tools'), 'react drops the C# settings');
    // Shared agnostic artifacts (no language tag) must also survive, EXCEPT any base rule that
    // is inlined by exactly one surviving react-owned rule under this filter (see
    // dropInlinedBaseRules) — react/react-code-quality extends shared/clean-code and
    // react/react-git extends shared/git; both base rules' bodies are already inlined via
    // resolvedBody, so installing the base too would write the content twice.
    const inlinedElsewhere = new Set(['shared/clean-code', 'shared/git']);
    const agnosticIds = resolvedCatalog.artifacts
      .filter(a => isAgnostic(a) && !inlinedElsewhere.has(a.id))
      .map(a => a.id);
    for (const id of agnosticIds) {
      assert.ok(ids.includes(id), `${id} must survive the react language filter (no language tag)`);
    }
    assert.ok(
      !ids.includes('shared/clean-code'),
      'shared/clean-code must be dropped — its body is inlined into react/react-code-quality, which also survives this filter',
    );
    assert.ok(
      !ids.includes('shared/git'),
      'shared/git must be dropped — its body is inlined into react/react-git, which also survives this filter',
    );
  });

  it('artifactLanguage returns language tag for language-bound artifact', () => {
    assert.equal(artifactLanguage({ frontmatter: { language: 'csharp' } }), 'csharp');
  });

  it('artifactLanguage returns undefined for agnostic artifact (no language key)', () => {
    assert.equal(artifactLanguage({ frontmatter: {} }), undefined);
  });

  it('isAgnostic returns true when no language field is set', () => {
    assert.equal(isAgnostic({ frontmatter: {} }), true);
  });

  it('isAgnostic returns false when a language field is set', () => {
    assert.equal(isAgnostic({ frontmatter: { language: 'python' } }), false);
  });

  it('every shared config-kind artifact is language-agnostic, and a language one sits in its language', () => {
    const configArtifacts = resolvedCatalog.artifacts.filter(a => CONFIG_KINDS.has(a.kind));
    assert.ok(configArtifacts.length > 0, 'catalog must have at least one config artifact');
    for (const a of configArtifacts) {
      const namespace = a.id.split('/')[0];
      const language = a.frontmatter.language as string | undefined;
      assert.equal(language ?? 'shared', namespace, `${a.id} (${a.kind}): language vs folder`);
    }
  });
});
