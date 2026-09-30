/**
 * `sigil validate` command — schema + reference-graph integrity check.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 *
 * @module
 */
import { loadCatalog } from '../load';
import { validateCatalog } from '../validate';
import { getAllTargets } from '../targets';

export interface ValidateOptions {
  catalogDir: string;
  packs: string;
}

export async function runValidate(opts: ValidateOptions): Promise<void> {
  console.log(`Validating catalog at: ${opts.catalogDir}`);
  const catalog = await loadCatalog(opts.catalogDir);
  const result = validateCatalog(catalog, getAllTargets());

  for (const w of result.warnings) console.warn(`  ⚠  ${w}`);
  for (const e of result.errors) {
    console.error(`  ✗  [${e.artifactId}] ${e.error}`);
    console.error(`     ${e.filePath}`);
  }

  if (result.valid) {
    console.log(`\n✓ All ${catalog.artifacts.length} artifact(s) are valid.`);
  } else {
    console.error(`\n✗ ${result.errors.length} error(s) found.`);
    process.exit(1);
  }
}
