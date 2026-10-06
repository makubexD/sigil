/**
 * Writes catalog/README.md from catalog/standard.yaml. Run via: npm run build. The output is
 * committed and checked for staleness by test/catalog-readme.test.ts, the same pattern as
 * docs/reference/capabilities.md.
 */
import fs from 'fs';
import path from 'path';
import { loadCatalogStandard } from './catalog-standard';
import { renderCatalogReadme } from './catalog-readme';

const CATALOG_DIR = path.resolve(__dirname, '../catalog');
const standard = loadCatalogStandard(CATALOG_DIR);
if (standard) {
  fs.writeFileSync(path.join(CATALOG_DIR, 'README.md'), renderCatalogReadme(standard), 'utf-8');
  console.log('  ✓ catalog/README.md');
}
