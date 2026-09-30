/**
 * `requireArtifact` — look up an artifact by id or throw the standard not-found error.
 *
 * Replaces 5 verbatim copies of "if (!artifact) throw notFoundError(...)" across
 * commands/{delete,get,edit,patch,retarget}.ts.
 *
 * @module
 */
import { notFoundError } from '../../errors';

/**
 * Returns `byId.get(id)` or throws `notFoundError` listing `availableIds`.
 * Generic over the artifact type so it works with both `LoadedCatalog.byId`
 * (raw `Artifact`) and `ResolvedCatalog.byId` (`ResolvedArtifact`) lookups.
 */
export function requireArtifact<T>(
  byId: Map<string, T>,
  availableIds: readonly string[],
  id: string,
  label = 'Artifact',
): T {
  const artifact = byId.get(id);
  if (!artifact) {
    throw notFoundError(label, id, availableIds);
  }
  return artifact;
}
