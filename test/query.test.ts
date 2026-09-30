/**
 * Tests for src/query.ts — searchArtifacts and getArtifactDetail.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../dist-cli/load';
import { resolveCatalog } from '../dist-cli/resolve';
import { searchArtifacts, getArtifactDetail, formatDetailText } from '../dist-cli/query/index';
import { getAllTargets } from '../dist-cli/targets';
import { CATALOG_DIR } from './helpers/catalog';

describe('F1 — searchArtifacts', () => {
  it('returns empty array for blank query', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const results = searchArtifacts(resolved, '');
    assert.deepEqual(results, []);
  });

  it('finds artifacts by title keyword', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    // Search for "generate" which matches cs-generate-tests, ng-generate-tests, ts-generate-tests etc.
    const results = searchArtifacts(resolved, 'generate');
    assert.ok(results.length >= 3, 'at least 3 generate artifacts');
    const ids = results.map(r => r.artifact.id);
    assert.ok(ids.includes('csharp/cs-generate-tests'), 'cs-generate-tests in results');
  });

  it('exact id match scores highest (score=8)', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const results = searchArtifacts(resolved, 'shared/code-reviewer');
    assert.ok(results.length > 0, 'got results');
    assert.equal(results[0]!.artifact.id, 'shared/code-reviewer', 'exact match is first');
    assert.equal(results[0]!.score, 8, 'exact match score is 8');
  });

  it('filters by kind', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const results = searchArtifacts(resolved, 'style', { kind: 'rule' });
    assert.ok(results.length > 0, 'got results');
    assert.ok(
      results.every(r => r.artifact.kind === 'rule'),
      'all results are rules',
    );
  });

  it('filters by tag substring', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const results = searchArtifacts(resolved, 'test', { tag: 'csharp' });
    assert.ok(
      results.every(r => {
        const tags = (r.artifact.frontmatter.tags as string[] | undefined) ?? [];
        return tags.some(t => t.toLowerCase().includes('csharp'));
      }),
      'all results have csharp tag',
    );
  });

  it('same-score results sorted alphabetically by id', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const results = searchArtifacts(resolved, 'testing');
    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1]!;
      const curr = results[i]!;
      if (prev.score === curr.score) {
        assert.ok(
          prev.artifact.id.localeCompare(curr.artifact.id) <= 0,
          `${prev.artifact.id} should come before ${curr.artifact.id} at same score`,
        );
      }
    }
  });

  it('returns no results when no artifact matches', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const results = searchArtifacts(resolved, 'zzznomatch999');
    assert.deepEqual(results, []);
  });
});

describe('F2 — getArtifactDetail', () => {
  it('includes reverse dependents for shared/code-reviewer', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const targets = getAllTargets();
    const artifact = resolved.byId.get('shared/code-reviewer')!;
    const detail = getArtifactDetail(artifact, catalog, targets);

    assert.ok(
      detail.reverseDependents.includes('python/py-generate-tests'),
      'py-generate-tests uses it',
    );
    assert.ok(
      detail.reverseDependents.includes('react/react-generate-tests'),
      'react-testing uses it',
    );
  });

  it('emits to both platforms when platforms field is absent', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const targets = getAllTargets();
    const artifact = resolved.byId.get('shared/code-reviewer')!;
    const detail = getArtifactDetail(artifact, catalog, targets);

    assert.ok(detail.targetPlatforms.includes('claude'), 'emits to claude');
    assert.ok(detail.targetPlatforms.includes('copilot'), 'emits to copilot');
  });

  it('resolvedRules populated for skill detail', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const targets = getAllTargets();
    const skill = resolved.byId.get('csharp/cs-generate-tests')!;
    const detail = getArtifactDetail(skill, catalog, targets);

    assert.ok(detail.resolvedRules.includes('csharp/cs-testing'), 'cs-testing in closure');
  });

  it('formatDetailText produces output containing id and title', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const targets = getAllTargets();
    const artifact = resolved.byId.get('shared/code-reviewer')!;
    const detail = getArtifactDetail(artifact, catalog, targets);
    const lines = formatDetailText(detail);

    assert.ok(lines.length > 0, 'produces output lines');
    assert.ok(
      lines.some(l => l.includes('shared/code-reviewer')),
      'id appears in output',
    );
    assert.ok(
      lines.some(l => l.includes('Code Reviewer')),
      'title appears in output',
    );
  });

  it('formatDetailText lists reverse dependents', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const targets = getAllTargets();
    const artifact = resolved.byId.get('shared/code-reviewer')!;
    const detail = getArtifactDetail(artifact, catalog, targets);
    const lines = formatDetailText(detail);

    assert.ok(
      lines.some(l => l.includes('used by')),
      '"used by" section present',
    );
    assert.ok(
      lines.some(l => l.includes('py-generate-tests')),
      'py-generate-tests listed as dependent',
    );
  });
});
