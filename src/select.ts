/**
 * Selector and filter resolver for the `add` command.
 *
 * Expands selector strings into concrete artifact IDs, applies --kind/--exclude/--language
 * filters, and records any artifact whose kind the chosen target doesn't support as a
 * "skipped" entry (warn-and-skip, not an error).
 *
 * Selector grammar:
 *   all                              → every artifact in the catalog
 *   pack:<name>                      → every artifact whose language is in that pack
 *   kind:<kind>                      → every artifact of that kind
 *   skill:<id> | agent:<id> | …     → explicit artifact (kind prefix stripped; validated)
 *   <id>                             → bare artifact ID lookup
 */

import type { ResolvedCatalog, ResolvedArtifact, Pack, ArtifactKind } from './types';

export interface SelectionFilters {
  /** Include only these kinds (comma-separated via CLI). */
  kinds?: string[];
  /** Exclude these kinds (comma-separated via CLI). */
  exclude?: string[];
  /** Include only artifacts for this language (shared artifacts are always included). */
  language?: string;
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

const KIND_PREFIXES: ArtifactKind[] = ['skill', 'agent', 'rule', 'prompt', 'workflow'];

/**
 * Resolve a list of selector strings + filters into a concrete set of artifact IDs.
 *
 * @param selectors    Raw selector strings from the CLI (e.g. 'all', 'pack:dotnet-pack').
 * @param filters      --kind/--exclude/--language flags.
 * @param catalog      Resolved catalog (all artifacts must be present).
 * @param packs        Pack list from packs.yaml.
 * @param supportedKinds  Kinds the chosen target can scaffold (empty = treat all as supported).
 */
export function resolveSelection(
  selectors: string[],
  filters: SelectionFilters,
  catalog: ResolvedCatalog,
  packs: Pack[],
  supportedKinds: ArtifactKind[],
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
    for (const k of KIND_PREFIXES) {
      if (selector.startsWith(`${k}:`)) {
        id = selector.slice(`${k}:`.length);
        break;
      }
    }

    if (!catalog.byId.has(id)) {
      throw new Error(
        `Artifact '${id}' not found. Run \`maku-catalog list\` to see available artifacts.`,
      );
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
    const lang = filters.language;
    candidates = candidates.filter(a => {
      const artifactLang = a.frontmatter.language as string | undefined;
      // Include if: exact language match, no language (shared), or id starts with 'shared/'
      return artifactLang === lang || artifactLang === undefined;
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
    } else {
      ids.push(a.id);
    }
  }

  return { ids, skipped };
}

/** Returns a human-readable label for an artifact (used in wizard choices). */
export function artifactLabel(a: ResolvedArtifact): string {
  const lang = a.frontmatter.language as string | undefined;
  const langTag = lang ? ` [${lang}]` : '';
  return `${a.id}${langTag}`;
}

/** Returns a hint string for an artifact (used in wizard choices). */
export function artifactHint(a: ResolvedArtifact): string {
  return (a.frontmatter.description as string | undefined) ?? '';
}
