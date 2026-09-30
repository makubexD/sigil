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
import { requireArtifact } from './shared/artifact';
import { JSON_INDENT } from '../json-util';

export interface GetOptions {
  catalogDir: string;
  json: boolean;
}

export async function runGet(id: string, opts: GetOptions): Promise<void> {
  const rawCatalog = await loadCatalog(opts.catalogDir);
  const resolved = resolveCatalog(rawCatalog);
  const targets = getAllTargets();

  const artifact = requireArtifact(
    resolved.byId,
    rawCatalog.artifacts.map(a => a.id),
    id,
  );

  const detail = getArtifactDetail(artifact, rawCatalog, targets);

  if (opts.json) {
    console.log(JSON.stringify(detail, null, JSON_INDENT));
    return;
  }

  console.log(formatDetailText(detail).join('\n'));
}
