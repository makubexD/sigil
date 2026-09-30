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

  /** Builds a fake unscoped rule, optionally with an appliesToRationale override. */
  function makeUnscopedRule(id: string, rationale?: string) {
    return {
      id,
      kind: 'rule' as const,
      filePath: `/fake/${id}.rule.md`,
      frontmatter: {
        id,
        kind: 'rule',
        title: 'Unscoped',
        description: 'A rule with a no-op appliesTo, for testing the validate warning.',
        appliesTo: ['**/*'],
        severity: 'recommended',
        ...(rationale !== undefined ? { appliesToRationale: rationale } : {}),
      },
      body: '- Fake body.',
    };
  }

  it('warns on no-op appliesTo without appliesToRationale', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const fakeRule = makeUnscopedRule('test/unscoped-no-rationale');
    catalog.artifacts.push(fakeRule);
    catalog.byId.set(fakeRule.id, fakeRule);

    const result = validateCatalog(catalog);
    assert.ok(
      result.warnings.some(w => w.includes('test/unscoped-no-rationale')),
      'warns for the unscoped rule without a rationale',
    );
  });

  it('suppresses the no-op appliesTo warning when appliesToRationale is set', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const fakeRule = makeUnscopedRule('test/unscoped-with-rationale', 'Deliberately universal.');
    catalog.artifacts.push(fakeRule);
    catalog.byId.set(fakeRule.id, fakeRule);

    const result = validateCatalog(catalog);
    assert.ok(
      !result.warnings.some(w => w.includes('test/unscoped-with-rationale')),
      'no warning when appliesToRationale justifies the unscoped appliesTo',
    );
  });

  it('still warns when appliesToRationale is whitespace-only', async () => {
    // A bare '' would fail the zod schema's `min(1)` before reaching this check at all —
    // whitespace-only passes the schema's length check but is still not a real rationale.
    const catalog = await loadCatalog(CATALOG_DIR);
    const fakeRule = makeUnscopedRule('test/unscoped-blank-rationale', '   ');
    catalog.artifacts.push(fakeRule);
    catalog.byId.set(fakeRule.id, fakeRule);

    const result = validateCatalog(catalog);
    assert.ok(
      result.warnings.some(w => w.includes('test/unscoped-blank-rationale')),
      'a whitespace-only rationale does not suppress the warning',
    );
  });

  /** Builds a fake rule extending the given ancestor with the given appliesTo scope. */
  function makeExtendingRule(id: string, ancestorId: string, appliesTo: string[]) {
    return {
      id,
      kind: 'rule' as const,
      filePath: `/fake/${id}.rule.md`,
      frontmatter: {
        id,
        kind: 'rule',
        title: 'Extending rule',
        description: 'A rule that extends a shared ancestor, for testing the duplicate warning.',
        extends: [ancestorId],
        appliesTo,
        severity: 'recommended',
      },
      body: '- Fake body.',
    };
  }

  it('warns when two rules extend the same ancestor with identical appliesTo', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const ruleA = makeExtendingRule('test/dup-scope-a', 'shared/clean-code', ['**/*.ts']);
    const ruleB = makeExtendingRule('test/dup-scope-b', 'shared/clean-code', ['**/*.ts']);
    catalog.artifacts.push(ruleA, ruleB);
    catalog.byId.set(ruleA.id, ruleA);
    catalog.byId.set(ruleB.id, ruleB);

    const result = validateCatalog(catalog);
    assert.ok(
      result.warnings.some(w => w.includes('test/dup-scope-a') && w.includes('test/dup-scope-b')),
      'warns naming both rules and the shared ancestor',
    );
  });

  it('does not warn when two rules extend the same ancestor with different appliesTo', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const ruleA = makeExtendingRule('test/diff-scope-a', 'shared/clean-code', ['**/*.ts']);
    const ruleB = makeExtendingRule('test/diff-scope-b', 'shared/clean-code', ['**/*.py']);
    catalog.artifacts.push(ruleA, ruleB);
    catalog.byId.set(ruleA.id, ruleA);
    catalog.byId.set(ruleB.id, ruleB);

    const result = validateCatalog(catalog);
    assert.ok(
      !result.warnings.some(
        w => w.includes('test/diff-scope-a') && w.includes('test/diff-scope-b'),
      ),
      'no warning when the two rules scope to different files',
    );
  });

  it('warns on a skill body with an un-framed hardcoded runner import', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const fakeSkill = {
      id: 'test/fake-skill-hardcoded-runner',
      kind: 'skill' as const,
      filePath: '/fake/fake-skill.SKILL.md',
      frontmatter: {
        id: 'test/fake-skill-hardcoded-runner',
        kind: 'skill',
        title: 'Fake Skill',
        description: 'A fake skill for testing the hardcoded-runner warning.',
        name: 'fake-skill-hardcoded-runner',
        language: 'typescript',
      },
      body: 'Write a test:\n\n```typescript\nimport { describe, it } from "vitest";\n```\n',
    };
    catalog.artifacts.push(fakeSkill);
    catalog.byId.set(fakeSkill.id, fakeSkill);

    const result = validateCatalog(catalog);
    assert.ok(
      result.warnings.some(w => w.includes('test/fake-skill-hardcoded-runner')),
      'warns for the un-framed vitest import',
    );
  });

  it('does not warn when the runner import is framed as an example', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const fakeSkill = {
      id: 'test/fake-skill-framed-runner',
      kind: 'skill' as const,
      filePath: '/fake/fake-skill-framed.SKILL.md',
      frontmatter: {
        id: 'test/fake-skill-framed-runner',
        kind: 'skill',
        title: 'Fake Skill',
        description: 'A fake skill for testing the framed-runner exemption.',
        name: 'fake-skill-framed-runner',
        language: 'typescript',
      },
      body:
        'Example shown with Vitest — mirror whatever the repo actually uses:\n\n' +
        '```typescript\nimport { describe, it } from "vitest";\n```\n',
    };
    catalog.artifacts.push(fakeSkill);
    catalog.byId.set(fakeSkill.id, fakeSkill);

    const result = validateCatalog(catalog);
    assert.ok(
      !result.warnings.some(w => w.includes('test/fake-skill-framed-runner')),
      'no warning when the hardcoded import is explicitly framed as an example',
    );
  });

  // 2026-08-22 audit F22: id/name are interpolated directly into output file paths with no
  // separate containment check, so schema-level rejection is the primary defense.
  it('rejects a skill whose name is not kebab-case (path-traversal guard, F22)', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);

    const fakeSkill = {
      id: 'test/fake-path-traversal-skill',
      kind: 'skill' as const,
      filePath: '/fake/fake-path-traversal.SKILL.md',
      frontmatter: {
        id: 'test/fake-path-traversal-skill',
        kind: 'skill',
        title: 'Fake Skill',
        description: 'A fake skill with an unsafe name.',
        name: '../../../etc/evil',
        language: 'typescript',
      },
      body: 'Body.',
    };
    catalog.artifacts.push(fakeSkill);
    catalog.byId.set(fakeSkill.id, fakeSkill);

    const result = validateCatalog(catalog);
    assert.ok(!result.valid, 'should be invalid');
    assert.ok(
      result.errors.some(e => e.artifactId === 'test/fake-path-traversal-skill'),
      'schema error reported for the unsafe name',
    );
  });

  it('rejects an id containing ".." (path-traversal guard, F22)', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);

    const fakeRule = {
      id: '../escaped/rule',
      kind: 'rule' as const,
      filePath: '/fake/escaped.rule.md',
      frontmatter: {
        id: '../escaped/rule',
        kind: 'rule',
        title: 'Fake Rule',
        description: 'A fake rule with an unsafe id.',
        severity: 'recommended',
      },
      body: '- Fake rule body.',
    };
    catalog.artifacts.push(fakeRule);
    catalog.byId.set(fakeRule.id, fakeRule);

    const result = validateCatalog(catalog);
    assert.ok(!result.valid, 'should be invalid');
    assert.ok(
      result.errors.some(e => e.artifactId === '../escaped/rule'),
      'schema error reported for the unsafe id',
    );
  });
});
