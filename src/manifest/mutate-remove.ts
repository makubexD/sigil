/**
 * removeEntries — remove manifest entries by ID, returning paths safe to delete from disk.
 * Split out of mutate.ts (whole-file upsert) to keep that file under the repo's own
 * module-size threshold.
 *
 * @module
 */
import type { Manifest, ManifestEntry } from './types';

/** Split manifest entries into those being removed (matching `target` + `idSet`) and the rest. */
function partitionRemovedEntries(
  entries: ManifestEntry[],
  idSet: Set<string>,
  target: string,
): { removed: ManifestEntry[]; remaining: ManifestEntry[] } {
  const removed: ManifestEntry[] = [];
  const remaining: ManifestEntry[] = [];

  for (const entry of entries) {
    if (entry.target === target && idSet.has(entry.id)) {
      removed.push(entry);
    } else {
      remaining.push(entry);
    }
  }
  return { removed, remaining };
}

/**
 * Remove manifest entries for the given IDs + target, returning the file paths
 * that should be deleted from disk (refcount-aware: a file is only returned when
 * no remaining entry still references it).
 */
export function removeEntries(
  manifest: Manifest,
  ids: string[],
  target: string,
): { pathsToDelete: string[]; removedEntries: ManifestEntry[] } {
  const idSet = new Set(ids);
  const { removed, remaining } = partitionRemovedEntries(manifest.entries, idSet, target);

  // Strip removed ids from the `dependentOf` lists of remaining entries
  for (const entry of remaining) {
    entry.dependentOf = entry.dependentOf.filter(d => !idSet.has(d));
  }

  manifest.entries = remaining;

  // Paths safe to delete: referenced only by removed entries
  const remainingPaths = new Set(
    remaining.filter(e => e.target === target).flatMap(e => e.files.map(f => f.path)),
  );

  const removedPaths = removed.flatMap(e => e.files.map(f => f.path));
  const pathsToDelete = removedPaths.filter(p => !remainingPaths.has(p));

  return { pathsToDelete, removedEntries: removed };
}
