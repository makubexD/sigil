/**
 * `sigil index` command — emit dist/registry.json.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolveCatalog } from '../resolve';
import { buildRegistry } from '../registry';
import { loadAndValidate, pkg } from '../cli-helpers';
import { JSON_INDENT } from '../json-util';

export interface IndexOptions {
  catalogDir: string;
  packs: string;
  outDir: string;
  json: boolean;
}

export async function runIndex(opts: IndexOptions): Promise<void> {
  const { catalog } = await loadAndValidate(opts.catalogDir, opts.packs);
  const resolved = resolveCatalog(catalog);
  const registry = buildRegistry(resolved, pkg.version, new Date().toISOString());

  if (opts.json) {
    console.log(JSON.stringify(registry, null, JSON_INDENT));
    return;
  }

  const registryPath = path.join(opts.outDir, 'registry.json');
  fs.mkdirSync(opts.outDir, { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, JSON_INDENT) + '\n', 'utf-8');
  console.log(
    `✓ ${registryPath}  (${registry.artifacts.length} artifacts, ${registry.facets.kinds.length} kinds, ${registry.facets.languages.length} languages)`,
  );
}
