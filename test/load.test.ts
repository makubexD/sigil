/**
 * Tests for src/load.ts — the raw catalog loading phase.
 * Exercises loadCatalog() against the bundled on-disk catalog.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../dist-cli/load';
import { CATALOG_DIR } from './helpers/catalog';

describe('Load phase', () => {
  it('loads all expected artifacts', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);

    // Languages
    assert.ok(catalog.languages.has('csharp'), 'csharp language loaded');
    assert.ok(catalog.languages.has('python'), 'python language loaded');
    assert.ok(catalog.languages.has('react'), 'react language loaded');

    // Shared artifacts
    assert.ok(catalog.byId.has('shared/clean-code'), 'shared/clean-code rule exists');
    assert.ok(catalog.byId.has('shared/code-reviewer'), 'shared/code-reviewer agent exists');
    assert.ok(catalog.byId.has('shared/explain-diff'), 'shared/explain-diff prompt exists');

    // Language artifacts
    assert.ok(catalog.byId.has('csharp/cs-conventions'), 'csharp/cs-conventions rule exists');
    assert.ok(
      catalog.byId.has('csharp/cs-generate-tests'),
      'csharp/cs-generate-tests skill exists',
    );
    // csharp/cs-api-architect was merged into cs-architecture-reviewer (2026-08-24 catalog
    // round 5) and deleted — asserting its absence guards against an accidental re-add.
    assert.ok(
      catalog.byId.has('csharp/cs-architecture-reviewer'),
      'csharp/cs-architecture-reviewer agent exists',
    );
    assert.ok(
      !catalog.byId.has('csharp/cs-api-architect'),
      'csharp/cs-api-architect was merged and deleted, not re-added',
    );

    assert.ok(catalog.byId.has('python/py-conventions'), 'python/py-conventions rule exists');
    assert.ok(
      catalog.byId.has('python/py-generate-tests'),
      'python/py-generate-tests skill exists',
    );

    assert.ok(catalog.byId.has('react/react-conventions'), 'react/react-conventions rule exists');
    assert.ok(
      catalog.byId.has('react/react-generate-tests'),
      'react/react-generate-tests skill exists',
    );
  });

  it('loads skill reference files', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    // react/react-generate-tests has a references/ directory with testing-library.md
    const skill = catalog.byId.get('react/react-generate-tests');
    assert.ok(skill, 'skill exists');
    assert.ok(skill.references && skill.references.length > 0, 'skill has references');
    assert.equal(skill.references![0]!.name, 'testing-library.md');
  });

  it('should return artifacts in source-path order, whatever order the glob library walks in', async () => {
    // Arrange
    const catalog = await loadCatalog(CATALOG_DIR);

    // Act
    const paths = catalog.artifacts.map(a => a.filePath);

    // Assert
    assert.deepEqual(paths, [...paths].sort());
  });
});
