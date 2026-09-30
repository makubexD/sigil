/**
 * `sigil get <id>` command — show full detail for a single catalog artifact.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 *
 * @module
 */
import { loadCatalog } from '../load';
import { resolveCatalog } from '../resolve';
import { getAllTargets } from '../targets';
import { getArtifactDetail, formatDetailText } from '../query';

export interface GetOptions {
  catalogDir: string;
  json: boolean;
}

export async function runGet(id: string, opts: GetOptions): Promise<void> {
  const rawCatalog = await loadCatalog(opts.catalogDir);
  const resolved = resolveCatalog(rawCatalog);
  const targets = getAllTargets();

  const artifact = resolved.byId.get(id);
  if (!artifact) {
    const available = rawCatalog.artifacts.map(a => a.id).join(', ');
    console.error(`✗ Artifact '${id}' not found. Available: ${available || '(none)'}`);
    process.exit(1);
  }

  const detail = getArtifactDetail(artifact, rawCatalog, targets);

  if (opts.json) {
    console.log(JSON.stringify(detail, null, 2));
    return;
  }

  console.log(formatDetailText(detail).join('\n'));
}
