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
    assert.ok(catalog.byId.has('csharp/cs-generate-tests'), 'csharp/cs-generate-tests skill exists');
    assert.ok(
      catalog.byId.has('csharp/cs-api-architect'),
      'csharp/cs-api-architect agent exists',
    );

    assert.ok(catalog.byId.has('python/py-style'), 'python/py-style rule exists');
    assert.ok(catalog.byId.has('python/py-pytest-testing'), 'python/py-pytest-testing skill exists');

    assert.ok(catalog.byId.has('react/react-style'), 'react/react-style rule exists');
    assert.ok(catalog.byId.has('react/component-testing'), 'react/component-testing skill exists');
  });

  it('loads skill reference files', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    // react/component-testing has a references/ directory with testing-library.md
    const skill = catalog.byId.get('react/component-testing');
    assert.ok(skill, 'skill exists');
    assert.ok(skill.references && skill.references.length > 0, 'skill has references');
    assert.equal(skill.references![0].name, 'testing-library.md');
  });
});
