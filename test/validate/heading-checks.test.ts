/**
 * `checkRepeatedHeadings`: resolve.ts prepends an ancestor's body to its child's, so an H2
 * heading present in both ships twice. The real-catalog row is proved by `npm run validate`
 * too; the test here keeps the bundled catalog as the regression guard.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { checkRepeatedHeadings } from '../../dist-cli/validate/heading-checks';
import { validateCatalog } from '../../dist-cli/validate';
import type { ValidateCtx } from '../../dist-cli/validate/types';
import { makeCatalog, makeRule, type FakeRule } from '../helpers/fixtures';
import { loadBundledCatalog } from '../helpers/catalog';

/** `makeRule` merges overrides into frontmatter only, so the catalog-facing id and body are set here. */
function makeCatalogRule(
  id: string,
  body: string,
  frontmatter: Record<string, unknown> = {},
): FakeRule {
  return { ...makeRule({ ...frontmatter, id }), id, body };
}

function errorsFor(artifacts: Parameters<typeof makeCatalog>[0]) {
  const ctx = {
    catalog: makeCatalog(artifacts),
    knownTargets: undefined,
    errors: [],
    warnings: [],
  } as unknown as ValidateCtx;
  checkRepeatedHeadings(ctx);
  return ctx.errors;
}

describe('checkRepeatedHeadings', () => {
  it('should error once, naming both artifacts, when a child repeats an inherited heading', () => {
    const parent = makeCatalogRule('shared/git', '## No Secrets\n\nParent text.');
    const child = makeCatalogRule('python/py-git', '## No Secrets\n\nChild text.', {
      extends: ['shared/git'],
    });

    const errors = errorsFor([parent, child]);

    assert.equal(errors.length, 1);
    assert.equal(errors[0]!.artifactId, 'python/py-git');
    assert.match(errors[0]!.error, /No Secrets/);
    assert.match(errors[0]!.error, /shared\/git/);
    assert.match(errors[0]!.error, /python\/py-git/);
  });

  it('should pass when the child and the parent have distinct headings', () => {
    const parent = makeCatalogRule('shared/git', '## Parent Heading\n\nParent text.');
    const child = makeCatalogRule('python/py-git', '## Child Heading\n\nChild text.', {
      extends: ['shared/git'],
    });

    assert.deepEqual(errorsFor([parent, child]), []);
  });

  it('should ignore a heading inside a fenced code block', () => {
    const parent = makeCatalogRule('shared/git', '## X\n\nParent text.');
    const child = makeCatalogRule('python/py-git', 'Example:\n\n```md\n## X\n```\n', {
      extends: ['shared/git'],
    });

    assert.deepEqual(errorsFor([parent, child]), []);
  });

  it('should ignore an H2 inside a tilde-fenced code block', () => {
    const parent = makeCatalogRule('shared/git', '## X\n\nParent text.');
    const child = makeCatalogRule('python/py-git', 'Example:\n\n~~~md\n## X\n~~~\n', {
      extends: ['shared/git'],
    });

    assert.deepEqual(errorsFor([parent, child]), []);
  });

  it('should keep a shorter fence inside a longer one open', () => {
    const parent = makeCatalogRule('shared/git', '## X\n\nParent text.');
    const child = makeCatalogRule('python/py-git', 'Example:\n\n````md\n```\n## X\n````\n', {
      extends: ['shared/git'],
    });

    assert.deepEqual(errorsFor([parent, child]), []);
  });

  it('should treat closing hashes and extra whitespace as the same heading', () => {
    const parent = makeCatalogRule('shared/git', '## X ##\n\nParent text.');
    const child = makeCatalogRule('python/py-git', '##  x\n\nChild text.', {
      extends: ['shared/git'],
    });

    const errors = errorsFor([parent, child]);

    assert.equal(errors.length, 1);
    assert.match(errors[0]!.error, /heading "## X"/);
  });

  it('should name the grandparent and the child when they share an H2', () => {
    const grandparent = makeCatalogRule('shared/grand', '## X\n\nGrandparent text.');
    const parent = makeCatalogRule('shared/parent', '## Parent\n\nParent text.', {
      extends: ['shared/grand'],
    });
    const child = makeCatalogRule('python/child', '## X\n\nChild text.', {
      extends: ['shared/parent'],
    });

    const errors = errorsFor([grandparent, parent, child]);

    assert.equal(errors.length, 1);
    assert.equal(errors[0]!.artifactId, 'python/child');
    assert.match(errors[0]!.error, /shared\/grand/);
    assert.match(errors[0]!.error, /python\/child/);
  });

  it('should report a diamond ancestor once, naming the source inherited twice', () => {
    const ancestor = makeCatalogRule('shared/d', '## D\n\nAncestor text.');
    const left = makeCatalogRule('shared/b', '## B\n\nLeft text.', { extends: ['shared/d'] });
    const right = makeCatalogRule('shared/c', '## C\n\nRight text.', { extends: ['shared/d'] });
    const child = makeCatalogRule('python/child', '## Child\n\nChild text.', {
      extends: ['shared/b', 'shared/c'],
    });

    const errors = errorsFor([ancestor, left, right, child]);

    assert.equal(errors.length, 1);
    assert.equal(errors[0]!.artifactId, 'python/child');
    assert.match(
      errors[0]!.error,
      /is inherited twice through more than one extends path: from shared\/d$/,
    );
  });

  it('should not throw on an extends cycle', () => {
    const a = makeCatalogRule('shared/a', '## A\n\nA text.', { extends: ['shared/b'] });
    const b = makeCatalogRule('shared/b', '## B\n\nB text.', { extends: ['shared/a'] });

    assert.doesNotThrow(() => errorsFor([a, b]));
  });

  it('should say a heading appears twice within the rule itself', () => {
    const rule = makeCatalogRule('python/child', '## X\n\nFirst.\n\n## X\n\nSecond.');

    const errors = errorsFor([rule]);

    assert.equal(errors.length, 1);
    assert.match(errors[0]!.error, /appears twice within python\/child/);
  });

  it('should error when a template-composed body repeats the parent heading', () => {
    const template = {
      id: 'shared/templates/heading-fixture',
      kind: 'template',
      filePath: '/fake/heading-fixture.template.md',
      frontmatter: {
        id: 'shared/templates/heading-fixture',
        kind: 'template',
        title: 'Heading Fixture',
        description: 'Template fixture for heading checks.',
        appliesToKind: ['rule'],
        revision: 1,
        slots: [{ key: 'body', required: true, description: 'Rule body.' }],
        docs: [{ url: 'https://example.com/docs', verifiedOn: '2026-01-01', covers: 'layout' }],
      },
      body: '## T\n\n<!-- slot: body -->',
    };
    const parent = makeCatalogRule('shared/git', '## T\n\nParent text.');
    const child = makeCatalogRule('python/py-git', '<!-- slot: body -->\nChild text.', {
      extends: ['shared/git'],
      template: 'shared/templates/heading-fixture',
    });

    const errors = errorsFor([template, parent, child]);

    assert.equal(errors.length, 1);
    assert.match(errors[0]!.error, /heading "## T"/);
  });

  it('should report no repeated-heading errors on the bundled catalog', async () => {
    const catalog = await loadBundledCatalog();

    const result = validateCatalog(catalog);

    const repeated = result.errors.filter(e => e.error.includes('appears twice'));
    assert.deepEqual(repeated, []);
  });
});
