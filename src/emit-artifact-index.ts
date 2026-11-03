/**
 * Writes docs/reference/artifacts.md from the catalog, packs.yaml and the registered targets.
 * Run via: npm run build. The output is committed and checked for staleness by
 * test/artifact-index.test.ts, the same pattern as docs/reference/capabilities.md.
 */
import fs from 'fs';
import path from 'path';
import { buildArtifactIndex, renderArtifactIndex } from './artifact-index';
import { loadAndValidate } from './cli-helpers';
import { resolveCatalog } from './resolve';
import { getAllTargets } from './targets/index';

const PKG_ROOT = path.resolve(__dirname, '..');
const CATALOG_DIR = path.join(PKG_ROOT, 'catalog');
const PACKS_FILE = path.join(PKG_ROOT, 'packs.yaml');
const OUTPUT_PATH = path.join(PKG_ROOT, 'docs/reference/artifacts.md');

async function main(): Promise<void> {
  const { catalog, packsConfig } = await loadAndValidate(CATALOG_DIR, PACKS_FILE);
  const resolved = resolveCatalog(catalog);
  const targets = getAllTargets().filter(target => target.scaffold);
  const page = renderArtifactIndex(
    buildArtifactIndex(resolved, packsConfig.packs, targets, PKG_ROOT),
    targets,
  );
  fs.writeFileSync(OUTPUT_PATH, page, 'utf-8');
  console.log('  ✓ docs/reference/artifacts.md');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
