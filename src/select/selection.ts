/**
 * Core selection logic: resolves selector strings into concrete artifact IDs,
 * applies --kind/--exclude/--language filters, and partitions into supported vs
 * skipped (kind not supported by the chosen target).
 *
 * Also exports shared constants and language helpers used by the other sub-modules.
 */
import type { ResolvedCatalog, ArtifactKind } from '../types';
import { KIND_ORDER as _KIND_ORDER, CONFIG_KINDS as _CONFIG_KINDS } from '../kinds';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface SelectionFilters {
  /** Include only these kinds (comma-separated via CLI). */
  kinds?: string[] | undefined;
  /** Exclude these kinds (comma-separated via CLI). */
  exclude?: string[] | undefined;
  /** Include only artifacts for this language (shared artifacts are always included). */
  language?: string | undefined;
}

export interface SkippedArtifact {
  id: string;
  kind: string;
  reason: string;
}

export interface SelectionResult {
  /** Ordered, de-duped artifact IDs to scaffold. */
  ids: string[];
  /** Artifacts removed because the target doesn't support their kind. */
  skipped: SkippedArtifact[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Canonical kind ordering for selector parsing and grouping sort.
 * Re-exported from src/kinds.ts — the authoritative single source.
 */
export const KIND_ORDER: ArtifactKind[] = _KIND_ORDER;

/**
 * Artifact kinds that merge into user-owned JSON files rather than writing whole
 * files. Config artifacts are language-agnostic and are treated differently in the
 * wizard picker (own dedicated group, excluded from the language filter).
 *
 * Re-exported from src/kinds.ts — the authoritative single source.
 */
export const CONFIG_KINDS = _CONFIG_KINDS as Set<string>;

// ─── Language helpers ─────────────────────────────────────────────────────────

/**
 * Returns the language tag for an artifact, or undefined for shared/agnostic artifacts.
 * Single source of truth for the `frontmatter.language` field — replaces scattered
 * `a.frontmatter.language as string | undefined` casts across the codebase.
 */
export function artifactLanguage(a: { frontmatter: Record<string, unknown> }): string | undefined {
  return a.frontmatter.language as string | undefined;
}

/**
 * Returns true when the artifact is language-agnostic (shared or config kinds).
 * Agnostic artifacts survive every language filter — they are always included.
 */
export function isAgnostic(a: { frontmatter: Record<string, unknown> }): boolean {
  return artifactLanguage(a) === undefined;
}

// ─── extends de-duplication (used inside resolveSelection, in selector-resolve.ts) ────

/** Maps each base-rule id to the descendant id whose `extends` inlines it, first-wins. */
function buildInlinedByMap(
  ids: string[],
  idSet: Set<string>,
  catalog: ResolvedCatalog,
): Map<string, string> {
  const inlinedBy = new Map<string, string>();
  for (const id of ids) {
    const artifact = catalog.byId.get(id);
    if (!artifact || artifact.kind !== 'rule') continue;
    const extendsIds = (artifact.frontmatter.extends as string[] | undefined) ?? [];
    for (const parentId of extendsIds) {
      if (idSet.has(parentId) && !inlinedBy.has(parentId)) {
        inlinedBy.set(parentId, id);
      }
    }
  }
  return inlinedBy;
}

/**
 * Drop a base rule from the install set when a rule that `extends` it is also being
 * installed — the base rule's body is already prepended into the descendant's
 * `resolvedBody` (see resolve.ts's `resolveRule`), so installing both writes the base
 * rule's content twice (once standalone, once inlined). Keeps the descendant; reports
 * the base rule as skipped rather than silently vanishing it.
 */
export function dropInlinedBaseRules(
  ids: string[],
  catalog: ResolvedCatalog,
): { ids: string[]; skipped: SkippedArtifact[] } {
  const inlinedBy = buildInlinedByMap(ids, new Set(ids), catalog);

  const skipped: SkippedArtifact[] = [];
  const filteredIds = ids.filter(id => {
    const inlinedInto = inlinedBy.get(id);
    if (!inlinedInto) return true;
    skipped.push({
      id,
      kind: 'rule',
      reason: `inlined into ${inlinedInto} via extends — already delivered`,
    });
    return false;
  });

  return { ids: filteredIds, skipped };
}

// ─── Platform restriction helper (used inside resolveSelection) ───────────────

/**
 * Returns true if the artifact should be emitted to the given platform/target.
 *
 * - When `platforms` is absent or empty, the artifact targets ALL platforms (DRY default).
 * - When `platforms` is present, it must include targetName.
 */
export function artifactTargetsPlatform(
  artifact: { frontmatter: Record<string, unknown> },
  targetName: string,
): boolean {
  const platforms = artifact.frontmatter.platforms as string[] | undefined;
  if (!platforms || platforms.length === 0) return true;
  return platforms.includes(targetName);
}
