/**
 * Installed dependencies that the artifact using them now carries inline — a rule `add` once wrote
 * as its own file for a skill, on a target whose skill spec inlines rules (Copilot,
 * docs/audits/2026-10-12). The provider loads that text twice. `sigil prune` removes them;
 * `sigil update` points there.
 *
 * Only an entry the manifest records as a dependency (`picked: false`) is removable. A manifest
 * written before `picked` existed cannot tell an explicit pick that later also became a dependency
 * from a pure dependency, so those entries are only reported (`unconfirmed`), never removed.
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

/** Inlined copies, split by whether the manifest proves the user didn't pick them. */
export interface InlinedDependencies {
  /** Recorded as installed only as a dependency: safe to remove. */
  removable: ManifestEntry[];
  /** From a manifest that predates `picked`: maybe an explicit pick, so report only. */
  unconfirmed: ManifestEntry[];
}

function stillUses(catalog: UsesLookup, parentId: string, depId: string): boolean {
  const uses = (catalog.byId.get(parentId)?.frontmatter as { uses?: { rules?: string[] } })?.uses;
  return uses?.rules?.includes(depId) ?? false;
}

/** True for a non-picked entry whose every recorded parent is still installed and still inlines it. */
function isInlinedDependency(
  entry: ManifestEntry,
  target: Target,
  installedIds: ReadonlySet<string>,
  catalog: UsesLookup,
): boolean {
  return (
    entry.picked !== true &&
    entry.dependentOf.length > 0 &&
    !isInstallableDependency(target, entry.kind) &&
    entry.dependentOf.every(id => installedIds.has(id) && stillUses(catalog, id, entry.id))
  );
}

/** The inlined copies among `entries` (one target's), split into removable and unconfirmed. */
export function inlinedDependencies(
  entries: readonly ManifestEntry[],
  target: Target,
  catalog: UsesLookup,
): InlinedDependencies {
  const installedIds = new Set(entries.map(e => e.id));
  const inlined = entries.filter(e => isInlinedDependency(e, target, installedIds, catalog));
  return {
    removable: inlined.filter(e => e.picked === false),
    unconfirmed: inlined.filter(e => e.picked === undefined),
  };
}
