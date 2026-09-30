/**
 * Acceptance test for the source-of-truth architecture: proves a brand-new provider can be added
 * with ZERO edits outside src/targets/test-fixture/. This is the gate the plan says must pass
 * before any real catalog artifact migrates onto a template — if this test needs a core-file
 * change to pass, the architecture is wrong, not the test.
 *
 * The fixture (src/targets/test-fixture/index.ts) is never registered in src/targets/index.ts —
 * doing so would make it a real, user-facing target. This test drives the 4-stage pipeline
 * (load → validate → resolve → compile) by hand instead, using loadCatalog's shape directly.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateCatalog } from '../dist-cli/validate';
import { resolveCatalog } from '../dist-cli/resolve';
import { resolveSelection } from '../dist-cli/select/selector-resolve';
import { TestFixtureTarget } from '../dist-cli/targets/test-fixture';
import { supportedKinds } from '../dist-cli/targets/capabilities';
import type { Artifact, LoadedCatalog } from '../dist-cli/types';

const TEMPLATE_ID = 'test-fixture/templates/reversible';
const SKILL_ID = 'test-fixture/skill-one';
const RULE_ID = 'test-fixture/rule-one';

function makeTemplate(): Artifact {
  return {
    id: TEMPLATE_ID,
    kind: 'template',
    filePath: '/fake/reversible.template.md',
    frontmatter: {
      id: TEMPLATE_ID,
      kind: 'template',
      title: 'Reversible',
      description: 'Template with two slots, for the extensibility acceptance test.',
      appliesToKind: ['skill'],
      revision: 1,
      slots: [
        { key: 'a', required: true, description: 'First half.' },
        { key: 'b', required: true, description: 'Second half.' },
      ],
      docs: [{ url: 'https://example.com/docs', verifiedOn: '2026-01-01', covers: 'layout' }],
    },
    body: '<!-- slot: a -->\n\n<!-- slot: b -->',
  };
}

function makeSkill(): Artifact {
  return {
    id: SKILL_ID,
    kind: 'skill',
    filePath: '/fake/skill-one/SKILL.md',
    frontmatter: {
      id: SKILL_ID,
      kind: 'skill',
      title: 'Skill One',
      description: 'A skill the fixture target scaffolds.',
      name: 'skill-one',
      language: 'shared',
      template: TEMPLATE_ID,
      'test-fixture': { priority: 7 },
    },
    body: '<!-- slot: a -->\nFirst-half content.\n\n<!-- slot: b -->\nSecond-half content.',
  };
}

function makeRule(): Artifact {
  return {
    id: RULE_ID,
    kind: 'rule',
    filePath: '/fake/rule-one.rule.md',
    frontmatter: {
      id: RULE_ID,
      kind: 'rule',
      title: 'Rule One',
      description: 'A rule kind the fixture target does not support.',
    },
    body: 'Some rule body.',
  };
}

function makeLoadedCatalog(): LoadedCatalog {
  const artifacts = [makeTemplate(), makeSkill(), makeRule()];
  return {
    artifacts,
    byId: new Map(artifacts.map(a => [a.id, a])),
    languages: new Map(),
    skipWarnings: [],
  } as unknown as LoadedCatalog;
}

describe('extensibility — a synthetic third provider needs zero core edits', () => {
  it('should validate a fixture: namespaced field declared via frontmatterExtensions', () => {
    // Arrange
    const catalog = makeLoadedCatalog();
    const fixture = new TestFixtureTarget();

    // Act
    const result = validateCatalog(catalog, [fixture]);

    // Assert
    assert.equal(result.valid, true, JSON.stringify(result.errors));
  });

  it('should reject a malformed fixture: field (wrong type) via the same composed schema', () => {
    // Arrange
    const catalog = makeLoadedCatalog();
    const badSkill = catalog.byId.get(SKILL_ID)!;
    badSkill.frontmatter['test-fixture'] = { priority: 'not-a-number' };
    const fixture = new TestFixtureTarget();

    // Act
    const result = validateCatalog(catalog, [fixture]);

    // Assert
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.artifactId === SKILL_ID && e.error.includes('fixture')));
  });

  it('should skip the rule kind (unsupported) and keep the skill kind (supported) in resolveSelection', () => {
    // Arrange
    const catalog = makeLoadedCatalog();
    const resolved = resolveCatalog(catalog);
    const fixture = new TestFixtureTarget();

    // Act
    const { ids, skipped } = resolveSelection({
      selectors: [SKILL_ID, RULE_ID],
      filters: {},
      catalog: resolved,
      packs: [],
      supportedKinds: supportedKinds(fixture),
      targetName: fixture.name,
    });

    // Assert
    assert.deepEqual(ids, [SKILL_ID]);
    assert.equal(skipped.length, 1);
    assert.equal(skipped[0]!.id, RULE_ID);
  });

  it('should rearrange resolvedSlots in a different order than the default resolvedBody', () => {
    // Arrange
    const catalog = makeLoadedCatalog();
    const resolved = resolveCatalog(catalog);
    const skill = resolved.byId.get(SKILL_ID)!;

    // Assert: resolvedBody follows the TEMPLATE's declared order (a, then b) — the default
    // every adapter gets for free.
    assert.ok(skill.resolvedBody);
    assert.ok(
      skill.resolvedBody!.indexOf('First-half') < skill.resolvedBody!.indexOf('Second-half'),
    );
    assert.deepEqual(skill.resolvedSlots, { a: 'First-half content.', b: 'Second-half content.' });
  });

  it('should compile via the fixture target, emitting the fixture: field and a reversed body', async () => {
    // Arrange
    const catalog = makeLoadedCatalog();
    const resolved = resolveCatalog(catalog);
    const fixture = new TestFixtureTarget();

    // Act
    const files = await fixture.compile(resolved, { version: '0.0.0', packs: [] });

    // Assert
    const written = files['fixture/test-fixture-skill-one.md'];
    assert.ok(written);
    assert.match(written!, /x-priority: 7/);
    // Fixture deliberately reverses slot order (b before a) — proving an adapter can rearrange
    // resolvedSlots rather than taking the default resolvedBody concatenation.
    assert.ok(written!.indexOf('Second-half') < written!.indexOf('First-half'));
    // Only the skill was compiled — the rule kind is outside supportedKinds.
    assert.equal(Object.keys(files).length, 1);
  });
});
