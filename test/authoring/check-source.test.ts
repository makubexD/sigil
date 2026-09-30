/**
 * Tests for src/authoring/check-source.ts — catalog source artifact validation.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../../dist-cli/load';
import { checkSourceArtifact } from '../../dist-cli/authoring/check-source';
import { getAllTargets } from '../../dist-cli/targets';
import { CATALOG_DIR } from '../helpers/catalog';

describe('E3 — checkSourceArtifact', () => {
  it('existing valid artifact → no violations', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const skill = catalog.byId.get('csharp/cs-generate-tests');
    assert.ok(skill, 'csharp/cs-generate-tests must exist in catalog');
    const targets = getAllTargets();
    const violations = checkSourceArtifact(skill, catalog, targets);
    assert.deepEqual(
      violations,
      [],
      `Expected no violations for a valid artifact, got:\n${violations.map(v => v.problem).join('\n')}`,
    );
  });

  it('id mismatch → violation', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const real = catalog.byId.get('csharp/cs-generate-tests');
    assert.ok(real, 'csharp/cs-generate-tests must exist');
    // id name segment ('wrong-id') doesn't match the frontmatter name ('cs-generate-tests')
    const synthetic = {
      ...real,
      id: 'csharp/wrong-id',
      frontmatter: { ...real.frontmatter, id: 'csharp/wrong-id' },
    };
    const targets = getAllTargets();
    const violations = checkSourceArtifact(synthetic, catalog, targets);
    assert.ok(violations.length > 0, 'expected at least one violation for id/name mismatch');
  });

  it('unknown platforms → violation', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const real = catalog.byId.get('shared/clean-code');
    assert.ok(real, 'shared/clean-code must exist');
    const synthetic = {
      ...real,
      frontmatter: { ...real.frontmatter, platforms: ['nonexistent-target'] },
    };
    const targets = getAllTargets();
    const violations = checkSourceArtifact(synthetic, catalog, targets);
    assert.ok(
      violations.some(v => v.problem.includes('nonexistent-target')),
      `expected violation mentioning unknown platform — got: ${violations.map(v => v.problem).join('; ')}`,
    );
  });

  it('kebab-case violation → violation', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const real = catalog.byId.get('csharp/cs-generate-tests');
    assert.ok(real, 'csharp/cs-generate-tests must exist');
    // name 'Not_Kebab' is not kebab-case; id name must also match, so keep them in sync
    const synthetic = {
      ...real,
      id: 'csharp/Not_Kebab',
      frontmatter: { ...real.frontmatter, id: 'csharp/Not_Kebab', name: 'Not_Kebab' },
    };
    const targets = getAllTargets();
    const violations = checkSourceArtifact(synthetic, catalog, targets);
    assert.ok(
      violations.some(v => v.problem.includes('kebab-case')),
      `expected kebab-case violation — got: ${violations.map(v => v.problem).join('; ')}`,
    );
  });

  it('duplicate id at same path → no violation (overwrite scenario, Windows path separator)', async () => {
    // Regression: on Windows, catalog.byId stores forward-slash paths but destPath
    // uses backslashes. The duplicate-id check must normalize before comparing.
    const catalog = await loadCatalog(CATALOG_DIR);
    const real = catalog.byId.get('csharp/cs-async');
    assert.ok(real, 'csharp/cs-async must exist (imported artifact)');
    // Simulate the overwrite scenario: artifact.filePath uses backslashes (Windows path.join)
    // while catalog entry uses forward slashes.
    const withBackslash = {
      ...real,
      filePath: real.filePath.replace(/\//g, '\\'),
    };
    const targets = getAllTargets();
    const violations = checkSourceArtifact(withBackslash, catalog, targets);
    const duplicateViolations = violations.filter(v => v.problem.includes('Duplicate id'));
    assert.deepEqual(
      duplicateViolations,
      [],
      `Expected no duplicate-id violation for same-path overwrite, got: ${duplicateViolations.map(v => v.problem).join('; ')}`,
    );
  });

  it('dep coverage drift → violation', () => {
    // Build a minimal fake catalog: a skill restricted to copilot that uses a
    // rule restricted to claude only. The dep checker should flag the drift.
    const fakeRule = {
      id: 'fake/restricted-rule',
      kind: 'rule' as const,
      filePath: '/fake/restricted-rule.rule.md',
      frontmatter: {
        id: 'fake/restricted-rule',
        kind: 'rule',
        title: 'Restricted Rule',
        description: 'A rule restricted to claude only.',
        severity: 'recommended',
        appliesTo: ['**/*'],
        platforms: ['claude'],
      },
      body: '- Rule body.',
    };
    const fakeSkill = {
      id: 'fake/drift-skill',
      kind: 'skill' as const,
      filePath: '/fake/drift-skill/SKILL.md',
      frontmatter: {
        id: 'fake/drift-skill',
        kind: 'skill',
        title: 'Drift Skill',
        description: 'A skill targeting copilot that uses a claude-only rule.',
        name: 'drift-skill',
        language: 'fake',
        platforms: ['copilot'],
        uses: { rules: ['fake/restricted-rule'] },
      },
      body: 'Skill body.',
    };
    const fakeCatalog = {
      artifacts: [fakeRule as any, fakeSkill as any],
      byId: new Map<string, any>([
        [fakeRule.id, fakeRule],
        [fakeSkill.id, fakeSkill],
      ]),
      languages: new Map<string, any>(),
    };
    const targets = getAllTargets();
    const violations = checkSourceArtifact(fakeSkill as any, fakeCatalog as any, targets);
    assert.ok(
      violations.some(
        v => v.problem.includes('coverage drift') || v.problem.includes('restricted'),
      ),
      `expected a coverage drift violation — got: ${violations.map(v => v.problem).join('; ')}`,
    );
  });
});
