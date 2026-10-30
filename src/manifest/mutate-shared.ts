/** Shared by mutate.ts and mutate-config.ts — kept in its own file to avoid a circular import. */
import type { CatalogSource, ManifestEntry } from './types';

/** Append each id in `toAdd` that isn't already present in `existing` (mutated in place). */
export function mergeDependentOf(existing: string[], toAdd: string[]): void {
  for (const parent of toAdd) {
    if (!existing.includes(parent)) existing.push(parent);
  }
}

/** True when two recorded sources name the same catalog (both absent = both bundled). */
export function sameCatalog(a: CatalogSource | undefined, b: CatalogSource | undefined): boolean {
  return a?.dir === b?.dir && a?.packs === b?.packs;
}

/**
 * Applies the caller's catalog record to `entry`, so re-adding an artifact from another catalog
 * moves it. Only a caller that carries the key at all touches it, so `update` never changes a
 * recorded source; a present-but-undefined catalog is the bundled one, whose entry keeps no key
 * (`catalog: undefined` would dirty the manifest JSON).
 */
export function applyCatalog(
  entry: ManifestEntry,
  from: { catalog?: CatalogSource | undefined },
): void {
  if (!('catalog' in from)) return;
  if (from.catalog === undefined) delete entry.catalog;
  else entry.catalog = from.catalog;
}
