/**
 * catalog/README.md is the catalog's anatomy for a person browsing the folders. It is generated
 * from catalog/standard.yaml by `npm run build`; this fails when the committed page is stale.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalogStandard } from '../dist-cli/catalog-standard';
import { renderCatalogReadme } from '../dist-cli/catalog-readme';
import { CATALOG_DIR } from './helpers/catalog';

describe('catalog/README.md', () => {
  it('should match catalog/standard.yaml (run npm run build to regenerate)', () => {
    const committed = fs.readFileSync(path.join(CATALOG_DIR, 'README.md'), 'utf8');
    assert.equal(committed, renderCatalogReadme(loadCatalogStandard(CATALOG_DIR)!));
  });

  it('should name every family and the skill anatomy', () => {
    const page = renderCatalogReadme(loadCatalogStandard(CATALOG_DIR)!);
    for (const family of loadCatalogStandard(CATALOG_DIR)!.families) {
      assert.match(page, new RegExp(`^\\| ${family.id} \\|`, 'm'), family.id);
    }
    assert.match(page, /## Skill anatomy/);
  });
});
