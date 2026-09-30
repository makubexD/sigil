/**
 * Core selection logic: resolves selector strings into concrete artifact IDs,
 * applies --kind/--exclude/--language filters, and partitions into supported vs
 * skipped (kind not supported by the chosen target).
 *
 * Also exports shared constants and language helpers used by the other sub-modules.
 */
import type { ResolvedCatalog, ResolvedArtifact, Pack, ArtifactKind, Target } from '../types';
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

// ─── Selector resolution ──────────────────────────────────────────────────────

/**
 * Resolve a list of selector strings + filters into a concrete set of artifact IDs.
 *
 * @param selectors       Raw selector strings from the CLI (e.g. 'all', 'pack:dotnet-pack').
 * @param filters         --kind/--exclude/--language flags.
 * @param catalog         Resolved catalog (all artifacts must be present).
 * @param packs           Pack list from packs.yaml.
 * @param supportedKinds  Kinds the chosen target can scaffold (empty = treat all as supported).
 * @param targetName      Optional platform name — used to apply platform restriction.
 */
export function resolveSelection(
  selectors: string[],
  filters: SelectionFilters,
  catalog: ResolvedCatalog,
  packs: Pack[],
  supportedKinds: ArtifactKind[],
  targetName?: string,
): SelectionResult {
  const candidateIds: string[] = [];
  const seen = new Set<string>();

  const addId = (id: string): void => {
    if (!seen.has(id)) {
      seen.add(id);
      candidateIds.push(id);
    }
  };

  for (const selector of selectors) {
    if (selector === 'all') {
      catalog.artifacts.forEach(a => addId(a.id));
      continue;
    }

    if (selector.startsWith('pack:')) {
      const packName = selector.slice('pack:'.length);
      const pack = packs.find(p => p.name === packName);
      if (!pack) {
        const available = packs.map(p => p.name).join(', ');
        throw new Error(
          `Unknown pack '${packName}'. Available packs: ${available || '(none — check packs.yaml)'}`,
        );
      }
      const packLangs = new Set(pack.languages ?? []);
      const packArtifactIds = new Set(pack.artifacts ?? []);
      catalog.artifacts
        .filter(a => {
          if (packArtifactIds.size > 0) return packArtifactIds.has(a.id);
          const lang = a.frontmatter.language as string | undefined;
          return lang !== undefined && packLangs.has(lang);
        })
        .forEach(a => addId(a.id));
      continue;
    }

    if (selector.startsWith('kind:')) {
      const kind = selector.slice('kind:'.length) as ArtifactKind;
      catalog.artifacts.filter(a => a.kind === kind).forEach(a => addId(a.id));
      continue;
    }

    // kind-prefixed: "skill:csharp/xunit-testing", "agent:shared/code-reviewer", etc.
    let id = selector;
    for (const k of KIND_ORDER) {
      if (selector.startsWith(`${k}:`)) {
        id = selector.slice(`${k}:`.length);
        break;
      }
    }

    if (!catalog.byId.has(id)) {
      throw new Error(`Artifact '${id}' not found. Run \`sigil list\` to see available artifacts.`);
    }
    addId(id);
  }

  // Apply --kind / --exclude / --language filters
  let candidates: ResolvedArtifact[] = candidateIds
    .map(id => catalog.byId.get(id)!)
    .filter(Boolean);

  if (filters.kinds && filters.kinds.length > 0) {
    const kindSet = new Set(filters.kinds);
    candidates = candidates.filter(a => kindSet.has(a.kind));
  }

  if (filters.exclude && filters.exclude.length > 0) {
    const excludeSet = new Set(filters.exclude);
    candidates = candidates.filter(a => !excludeSet.has(a.kind));
  }

  if (filters.language) {
    candidates = candidates.filter(a => {
      const lang = artifactLanguage(a);
      return lang === filters.language || lang === undefined;
    });
  }

  // Partition into supported and skipped
  const supportedSet = new Set<string>(supportedKinds);
  const ids: string[] = [];
  const skipped: SkippedArtifact[] = [];

  for (const a of candidates) {
    if (supportedSet.size > 0 && !supportedSet.has(a.kind)) {
      skipped.push({
        id: a.id,
        kind: a.kind,
        reason: `kind '${a.kind}' is not supported for this target`,
      });
    } else if (targetName && !artifactTargetsPlatform(a, targetName)) {
      const restricted = (a.frontmatter.platforms as string[]).join(', ');
      skipped.push({
        id: a.id,
        kind: a.kind,
        reason: `restricted to platforms: [${restricted}]`,
      });
    } else {
      ids.push(a.id);
    }
  }

  return { ids, skipped };
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
