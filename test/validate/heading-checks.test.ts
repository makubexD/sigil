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

function errorsFor(rules: FakeRule[]) {
  const ctx = {
    catalog: makeCatalog(rules),
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

  it('should report no repeated-heading errors on the bundled catalog', async () => {
    const catalog = await loadBundledCatalog();

    const result = validateCatalog(catalog);

    const repeated = result.errors.filter(e => e.error.includes('appears twice'));
    assert.deepEqual(repeated, []);
  });
});
