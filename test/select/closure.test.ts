/**
 * Tests for src/select/closure.ts — dependency-closure computation.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveCatalog } from '../../dist-cli/resolve';
import { computeClosure } from '../../dist-cli/select/index';
import { loadBundledCatalog } from '../helpers/catalog';

describe('computeClosure', () => {
  it('identifies the primary artifact and its dependency closure', async () => {
    const catalog = await loadBundledCatalog();
    const resolved = resolveCatalog(catalog);

    const { primary, dependencies } = computeClosure(['csharp/cs-generate-tests'], resolved);

    // Primary
    assert.equal(primary.length, 1, 'one primary artifact');
    assert.equal(primary[0]!.id, 'csharp/cs-generate-tests');

    // Dependencies
    const depIds = dependencies.map(d => d.artifact.id);
    assert.ok(depIds.includes('csharp/cs-testing'), 'cs-testing rule is a dependency');
    assert.ok(depIds.includes('csharp/cs-code-reviewer'), 'cs-code-reviewer agent is a dependency');

    // Rules come before agents in the dependency list
    const ruleIdx = depIds.indexOf('csharp/cs-testing');
    const agentIdx = depIds.indexOf('csharp/cs-code-reviewer');
    assert.ok(ruleIdx < agentIdx, 'rules listed before agents');

    // via attribute names the skill that pulls each dep in
    const ruleDep = dependencies.find(d => d.artifact.id === 'csharp/cs-testing');
    assert.ok(ruleDep?.via.includes('csharp/cs-generate-tests'), 'via references the source skill');
  });

  it('excludes directly-selected artifacts from the dependency list', async () => {
    const catalog = await loadBundledCatalog();
    const resolved = resolveCatalog(catalog);

    // Selecting the rule AND the skill — the rule is a direct pick, not a dependency
    const { primary, dependencies } = computeClosure(
      ['csharp/cs-generate-tests', 'csharp/cs-testing'],
      resolved,
    );

    assert.equal(primary.length, 2, 'two primary artifacts');
    const depIds = dependencies.map(d => d.artifact.id);
    assert.ok(!depIds.includes('csharp/cs-testing'), 'directly-selected rule not in dependencies');
    assert.ok(depIds.includes('csharp/cs-code-reviewer'), 'agent is still a dependency');
  });

  it('returns empty dependencies when selection contains no skills', async () => {
    const catalog = await loadBundledCatalog();
    const resolved = resolveCatalog(catalog);

    const { primary, dependencies } = computeClosure(['shared/code-reviewer'], resolved);

    assert.equal(primary.length, 1, 'one primary artifact');
    assert.equal(dependencies.length, 0, 'no dependencies when primary has no skills');
  });

  it('returns empty dependencies when all closure artifacts are already primary picks', async () => {
    const catalog = await loadBundledCatalog();
    const resolved = resolveCatalog(catalog);

    // Selecting skill + all its deps directly → no computed dependencies
    const { dependencies } = computeClosure(
      ['csharp/cs-generate-tests', 'csharp/cs-testing', 'csharp/cs-code-reviewer'],
      resolved,
    );
    assert.equal(dependencies.length, 0, 'all closure members already in primary — no deps');
  });
});
