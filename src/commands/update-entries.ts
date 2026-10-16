/**
 * `sigil update` — which manifest entries a run updates: the target's entries (or the ids asked
 * for), minus those whose consumer overlay was refused (src/overlays.ts), which stay as installed.
 *
 * @module
 */
import { withoutRefused } from '../overlays';
import type { Manifest, ManifestEntry } from '../manifest/types';

/** Filters manifest entries by target (and by explicit ids, when provided). */
function filterEntriesToUpdate(
  manifest: { entries: ManifestEntry[] },
  targetName: string,
  idFilter: Set<string>,
): ManifestEntry[] {
  return manifest.entries.filter(
    e => e.target === targetName && (idFilter.size === 0 || idFilter.has(e.id)),
  );
}

/** Prints the "nothing to update" message when the entry filter matched zero entries. */
function printNoEntriesMessage(idFilter: Set<string>, targetName: string): void {
  const msg =
    idFilter.size > 0
      ? `No installed artifacts match: ${[...idFilter].join(', ')}`
      : `No artifacts installed for target '${targetName}'.`;
  console.log(`\n  ${msg}\n`);
}

/**
 * The manifest entries to update, without those whose overlay was refused (each reported); undefined,
 * after saying so, when none matched.
 */
export function entriesToUpdate(
  manifest: Manifest,
  targetName: string,
  ids: string[],
  refused: ReadonlyMap<string, string>,
): ManifestEntry[] | undefined {
  const idFilter = new Set(ids);
  const entries = filterEntriesToUpdate(manifest, targetName, idFilter);
  if (entries.length === 0) {
    printNoEntriesMessage(idFilter, targetName);
    return undefined;
  }
  return withoutRefused(entries, refused);
}
