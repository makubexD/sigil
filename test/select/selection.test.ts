/**
 * Tests for src/select/index.ts — resolveSelection, artifactLanguage, isAgnostic.
 * (Parts of the R block dealing with selection logic, not wizard navigation.)
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../../dist-cli/load';
import { resolveCatalog } from '../../dist-cli/resolve';
import {
  resolveSelection,
  computeClosure,
  CONFIG_KINDS,
  artifactLanguage,
  isAgnostic,
} from '../../dist-cli/select/index';
import { CATALOG_DIR } from '../helpers/catalog';
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
      'react/component-testing',
      'shared/filesystem',
      'shared/protect-config',
      'shared/allow-dev-tools',
    ],
  },
];

describe('R — resolveSelection / language helpers', () => {
  let resolvedCatalog: ResolvedCatalog;

  beforeEach(async () => {
    const cat = await loadCatalog(CATALOG_DIR);
    resolvedCatalog = resolveCatalog(cat) as ResolvedCatalog;
  });

  it('resolveSelection pack:essentials returns exactly the 5 agnostic artifact IDs', () => {
    const { ids } = resolveSelection(['pack:essentials'], {}, resolvedCatalog, PACKS_CURATED, []);
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
    const { ids } = resolveSelection(
      ['pack:react-starter'],
      {},
      resolvedCatalog,
      PACKS_CURATED,
      [],
    );
    const expected = [
      'react/component-testing',
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

  it('computeClosure for react-starter primary IDs adds rule + code-reviewer as deps', () => {
    const { ids } = resolveSelection(
      ['pack:react-starter'],
      {},
      resolvedCatalog,
      PACKS_CURATED,
      [],
    );
    const cp = computeClosure(ids, resolvedCatalog);
    const depIds = cp.dependencies.map(d => d.artifact.id);
    assert.ok(
      depIds.includes('react/react-style'),
      'react-starter closure must include react/react-style (via skill uses.rules)',
    );
    assert.ok(
      depIds.includes('shared/code-reviewer'),
      'react-starter closure must include shared/code-reviewer (via skill uses.agents)',
    );
  });

  it('language filter on "all" keeps every config/agnostic artifact', () => {
    const { ids } = resolveSelection(
      ['all'],
      { language: 'react' },
      resolvedCatalog,
      PACKS_CURATED,
      [],
    );
    // All config kinds must survive the react language filter
    const configIds = resolvedCatalog.artifacts
      .filter(a => CONFIG_KINDS.has(a.kind))
      .map(a => a.id);
    for (const id of configIds) {
      assert.ok(ids.includes(id), `${id} must survive the react language filter (agnostic)`);
    }
    // Shared agnostic artifacts (no language tag) must also survive
    const agnosticIds = resolvedCatalog.artifacts.filter(a => isAgnostic(a)).map(a => a.id);
    for (const id of agnosticIds) {
      assert.ok(ids.includes(id), `${id} must survive the react language filter (no language tag)`);
    }
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

  it('every config-kind artifact in the catalog is language-agnostic', () => {
    const configArtifacts = resolvedCatalog.artifacts.filter(a => CONFIG_KINDS.has(a.kind));
    assert.ok(configArtifacts.length > 0, 'catalog must have at least one config artifact');
    for (const a of configArtifacts) {
      assert.equal(
        isAgnostic(a),
        true,
        `${a.id} (${a.kind}) is a config kind and must be language-agnostic`,
      );
    }
  });
});
