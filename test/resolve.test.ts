/**
 * Tests for src/resolve.ts — DRY resolution phase (extends + uses expansion).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../dist-cli/load';
import { resolveCatalog } from '../dist-cli/resolve';
import { CATALOG_DIR } from './helpers/catalog';

describe('Resolve phase', () => {
  it('flattens extends chains for rules', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);

    const csRule = resolved.byId.get('csharp/cs-conventions');
    assert.ok(csRule, 'csharp/cs-conventions resolved');

    // resolvedBody should contain BOTH the parent (shared/clean-code) body
    // AND the csharp/cs-conventions body
    assert.ok(
      csRule.resolvedBody?.includes('Clear names'),
      'inherited clean-code guidance present',
    );
    assert.ok(csRule.resolvedBody?.includes('Nullable Reference Types'), 'own guidance present');
  });

  it('expands uses.rules for skills', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);

    const skill = resolved.byId.get('csharp/cs-generate-tests');
    assert.ok(skill, 'csharp/cs-generate-tests resolved');
    assert.ok(skill.resolvedRules && skill.resolvedRules.length > 0, 'resolvedRules populated');
    assert.equal(skill.resolvedRules![0].id, 'csharp/cs-testing');
  });

  it('expands uses.agents for skills', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);

    const skill = resolved.byId.get('csharp/cs-generate-tests');
    assert.ok(skill?.resolvedAgentIds?.includes('csharp/cs-code-reviewer'), 'agent id recorded');
  });
});
