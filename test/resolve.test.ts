/**
 * Tests for src/resolve.ts — DRY resolution phase (template + extends + uses expansion).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../dist-cli/load';
import { resolveCatalog } from '../dist-cli/resolve';
import { CATALOG_DIR } from './helpers/catalog';
import type { Artifact, LoadedCatalog } from '../dist-cli/types';

const TEMPLATE_FRONTMATTER = {
  kind: 'template',
  title: 'Workflow Skill',
  description: 'Ordered, step-driven skill template.',
  appliesToKind: ['skill', 'rule'],
  revision: 1,
  slots: [{ key: 'body', required: true, description: 'Main content.' }],
  docs: [{ url: 'https://example.com/docs', verifiedOn: '2026-01-01', covers: 'layout' }],
};

/** Builds a minimal in-memory LoadedCatalog for unit-testing resolveCatalog in isolation. */
function makeCatalog(artifacts: Artifact[]): LoadedCatalog {
  return {
    artifacts,
    byId: new Map(artifacts.map(a => [a.id, a])),
    languages: new Map(),
    skipWarnings: [],
  };
}

describe('Resolve phase', () => {
  it('flattens extends chains for rules', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);

    // Only *-code-quality extends shared/clean-code (one family, one skeleton ADR).
    const csRule = resolved.byId.get('csharp/cs-code-quality');
    assert.ok(csRule, 'csharp/cs-code-quality resolved');

    // resolvedBody should contain BOTH the parent (shared/clean-code) body
    // AND the csharp/cs-code-quality body
    assert.ok(
      csRule.resolvedBody?.includes('Clear names'),
      'inherited clean-code guidance present',
    );
    assert.ok(
      csRule.resolvedBody?.includes('Max 20 lines per method body'),
      'own guidance present',
    );
  });

  it('expands uses.rules for skills', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);

    const skill = resolved.byId.get('csharp/cs-generate-tests');
    assert.ok(skill, 'csharp/cs-generate-tests resolved');
    assert.ok(skill.resolvedRules && skill.resolvedRules.length > 0, 'resolvedRules populated');
    assert.equal(skill.resolvedRules![0]!.id, 'csharp/cs-testing');
  });

  it('expands uses.agents for skills', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);

    const skill = resolved.byId.get('csharp/cs-generate-tests');
    assert.ok(skill?.resolvedAgentIds?.includes('csharp/cs-code-reviewer'), 'agent id recorded');
  });
});

describe('Resolve phase — template composition', () => {
  it('leaves an artifact with no template: field untouched (no resolvedSlots/templateId)', () => {
    // Arrange
    const skill: Artifact = {
      id: 'x/plain-skill',
      kind: 'skill',
      filePath: '/fake/plain-skill/SKILL.md',
      frontmatter: { id: 'x/plain-skill', kind: 'skill', name: 'plain-skill', language: 'x' },
      body: 'hand-authored body',
    };

    // Act
    const resolved = resolveCatalog(makeCatalog([skill]));
    const result = resolved.byId.get('x/plain-skill')!;

    // Assert
    assert.equal(result.resolvedBody, undefined);
    assert.equal(result.resolvedSlots, undefined);
    assert.equal(result.templateId, undefined);
  });

  it('composes a skill body against its template and exposes resolvedSlots', () => {
    // Arrange
    const template: Artifact = {
      id: 'shared/templates/t1',
      kind: 'template',
      filePath: '/fake/t1.template.md',
      frontmatter: { id: 'shared/templates/t1', ...TEMPLATE_FRONTMATTER },
      body: '## Heading\n\n<!-- slot: body -->\n\nFooter.',
    };
    const skill: Artifact = {
      id: 'x/templated-skill',
      kind: 'skill',
      filePath: '/fake/templated-skill/SKILL.md',
      frontmatter: {
        id: 'x/templated-skill',
        kind: 'skill',
        name: 'templated-skill',
        language: 'x',
        template: 'shared/templates/t1',
      },
      body: '<!-- slot: body -->\nMain content here.',
    };

    // Act
    const resolved = resolveCatalog(makeCatalog([template, skill]));
    const result = resolved.byId.get('x/templated-skill')!;

    // Assert
    assert.equal(result.templateId, 'shared/templates/t1');
    assert.deepEqual(result.resolvedSlots, { body: 'Main content here.' });
    assert.match(result.resolvedBody!, /## Heading\n\nMain content here\.\n\nFooter\./);
  });

  it('composes template BEFORE prepending the extends chain, on a rule', () => {
    // Arrange
    const template: Artifact = {
      id: 'shared/templates/t2',
      kind: 'template',
      filePath: '/fake/t2.template.md',
      frontmatter: { id: 'shared/templates/t2', ...TEMPLATE_FRONTMATTER },
      body: '<!-- slot: body -->',
    };
    const parentRule: Artifact = {
      id: 'shared/parent-rule',
      kind: 'rule',
      filePath: '/fake/parent-rule.rule.md',
      frontmatter: { id: 'shared/parent-rule', kind: 'rule' },
      body: 'PARENT BODY',
    };
    const childRule: Artifact = {
      id: 'x/child-rule',
      kind: 'rule',
      filePath: '/fake/child-rule.rule.md',
      frontmatter: {
        id: 'x/child-rule',
        kind: 'rule',
        extends: ['shared/parent-rule'],
        template: 'shared/templates/t2',
      },
      body: '<!-- slot: body -->\nCHILD BODY',
    };

    // Act
    const resolved = resolveCatalog(makeCatalog([template, parentRule, childRule]));
    const result = resolved.byId.get('x/child-rule')!;

    // Assert: parent body first, then the template-composed own body — not the raw own body.
    assert.equal(result.resolvedBody, 'PARENT BODY\n\nCHILD BODY');
    assert.deepEqual(result.resolvedAncestorBodies, ['PARENT BODY']);
    assert.equal(result.templateId, 'shared/templates/t2');
  });
});
