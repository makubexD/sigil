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
import { SigilError } from '../errors';

export interface ValidateOptions {
  catalogDir: string;
  packs: string;
}

export async function runValidate(opts: ValidateOptions): Promise<void> {
  console.log(`Validating catalog at: ${opts.catalogDir}`);
  const catalog = await loadCatalog(opts.catalogDir);
  for (const w of catalog.skipWarnings) console.warn(w);
  const result = validateCatalog(catalog, getAllTargets());

  for (const w of result.warnings) console.warn(`  ⚠  ${w}`);

  if (result.valid) {
    console.log(`\n✓ All ${catalog.artifacts.length} artifact(s) are valid.`);
    return;
  }

  const lines = result.errors.map(e => `  ✗  [${e.artifactId}] ${e.error}\n     ${e.filePath}`);
  throw new SigilError(`${result.errors.length} error(s) found.`, { hint: lines.join('\n') });
}
