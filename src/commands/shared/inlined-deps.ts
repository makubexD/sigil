/**
 * Installed dependencies that the artifact using them now carries inline — a rule `add` once wrote
 * as its own file for a skill, on a target whose skill spec inlines rules (Copilot,
 * docs/audits/2026-10-12). The provider loads that text twice. `sigil prune` removes them;
 * `sigil update` points there.
 *
 * A manifest written before the fix cannot tell an explicit pick that later also became a
 * dependency from a pure dependency; `prune` lists both, so its preview names the parents.
 *
 * @module
 */
import type { ManifestEntry } from '../../manifest';
import { isInstallableDependency } from '../../targets/capabilities';
import type { Artifact, Target } from '../../types';

/** Catalog lookup for whether a parent still lists a dependency in `uses:`. */
export interface UsesLookup {
  readonly byId: ReadonlyMap<string, Pick<Artifact, 'frontmatter'>>;
}

function stillUses(catalog: UsesLookup, parentId: string, depId: string): boolean {
  const uses = (catalog.byId.get(parentId)?.frontmatter as { uses?: { rules?: string[] } })?.uses;
  return uses?.rules?.includes(depId) ?? false;
}

/** True for an entry installed purely as a dependency — every recorded parent still installed and
 * still inlining it. */
export function isInlinedDependency(
  entry: ManifestEntry,
  target: Target,
  installedIds: ReadonlySet<string>,
  catalog: UsesLookup,
): boolean {
  return (
    entry.dependentOf.length > 0 &&
    !isInstallableDependency(target, entry.kind) &&
    entry.dependentOf.every(id => installedIds.has(id) && stillUses(catalog, id, entry.id))
  );
}

/** The entries of `entries` (one target's) that {@link isInlinedDependency} matches. */
export function inlinedDependencies(
  entries: readonly ManifestEntry[],
  target: Target,
  catalog: UsesLookup,
): ManifestEntry[] {
  const installedIds = new Set(entries.map(e => e.id));
  return entries.filter(e => isInlinedDependency(e, target, installedIds, catalog));
}
