/**
 * Tests for src/validate.ts — catalog validation phase.
 * Each test loads a fresh (mutable) catalog so injected fake artifacts
 * do not contaminate siblings or the memoized catalog.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../dist-cli/load';
import { validateCatalog } from '../dist-cli/validate';
import { CATALOG_DIR } from './helpers/catalog';

describe('Validate phase', () => {
  it('passes with no errors on the seeded catalog', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const result = validateCatalog(catalog);

    if (!result.valid) {
      const msg = result.errors.map(e => `[${e.artifactId}] ${e.error}`).join('\n');
      assert.fail(`Validation failed:\n${msg}`);
    }

    assert.equal(result.errors.length, 0);
  });

  it('reports an error for a dangling extends reference', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);

    // Inject a fake artifact with a bad extends reference
    const fakeRule = {
      id: 'test/fake-rule',
      kind: 'rule' as const,
      filePath: '/fake/path.rule.md',
      frontmatter: {
        id: 'test/fake-rule',
        kind: 'rule',
        title: 'Fake Rule',
        description: 'A fake rule for testing.',
        extends: ['does-not/exist'],
        appliesTo: ['**/*'],
        severity: 'recommended',
      },
      body: '- Fake rule body.',
    };
    catalog.artifacts.push(fakeRule);
    catalog.byId.set(fakeRule.id, fakeRule);

    const result = validateCatalog(catalog);
    assert.ok(!result.valid, 'should be invalid');
    assert.ok(
      result.errors.some(e => e.error.includes('does-not/exist')),
      'error message mentions the missing id',
    );
  });

  it('detects cycles in extends', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);

    const ruleA = {
      id: 'test/cycle-a',
      kind: 'rule' as const,
      filePath: '/fake/cycle-a.rule.md',
      frontmatter: {
        id: 'test/cycle-a',
        kind: 'rule',
        title: 'A',
        description: 'A',
        extends: ['test/cycle-b'],
        appliesTo: ['**/*'],
        severity: 'recommended',
      },
      body: '- A',
    };
    const ruleB = {
      id: 'test/cycle-b',
      kind: 'rule' as const,
      filePath: '/fake/cycle-b.rule.md',
      frontmatter: {
        id: 'test/cycle-b',
        kind: 'rule',
        title: 'B',
        description: 'B',
        extends: ['test/cycle-a'],
        appliesTo: ['**/*'],
        severity: 'recommended',
      },
      body: '- B',
    };
    catalog.artifacts.push(ruleA, ruleB);
    catalog.byId.set(ruleA.id, ruleA);
    catalog.byId.set(ruleB.id, ruleB);

    const result = validateCatalog(catalog);
    assert.ok(!result.valid, 'should detect the cycle');
    assert.ok(
      result.errors.some(e => e.error.includes('Cycle')),
      'error mentions cycle',
    );
  });
});
