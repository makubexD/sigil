/**
 * `sigil update` — which manifest entries a run updates: the target's entries (or the ids asked
 * for). The per-catalog pass removes the ones whose consumer overlay was refused (src/overlays.ts),
 * which stay as installed (`src/commands/update-groups.ts`).
 *
 * @module
 */
import type { ManifestEntry } from '../manifest/types';

/** Filters manifest entries by target (and by explicit ids, when provided). */
export function filterEntriesToUpdate(
  manifest: { entries: readonly ManifestEntry[] },
  targetName: string,
  idFilter: ReadonlySet<string>,
): ManifestEntry[] {
  return manifest.entries.filter(
    e => e.target === targetName && (idFilter.size === 0 || idFilter.has(e.id)),
  );
}

/** Prints the "nothing to update" message when the entry filter matched zero entries. */
export function printNoEntriesMessage(idFilter: ReadonlySet<string>, targetName: string): void {
  const msg =
    idFilter.size > 0
      ? `No installed artifacts match: ${[...idFilter].join(', ')}`
      : `No artifacts installed for target '${targetName}'.`;
  console.log(`\n  ${msg}\n`);
}
