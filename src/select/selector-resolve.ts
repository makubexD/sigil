/**
 * Selector-string resolution: expands raw selector strings (all/pack:/kind:/bare-id)
 * into concrete artifact ids, then applies filters and target-support partitioning.
 * Split out of selection.ts to keep that file under the repo's own module-size threshold.
 *
 * @module
 */
import type { ResolvedCatalog, ResolvedArtifact, Pack, ArtifactKind } from '../types';
import {
  KIND_ORDER,
  artifactLanguage,
  artifactTargetsPlatform,
  dropInlinedBaseRules,
  type SelectionFilters,
  type SkippedArtifact,
  type SelectionResult,
} from './selection';

/** True when artifact `a` belongs to the pack (explicit artifact list, or language match). */
function matchesPackMembership(
  a: ResolvedArtifact,
  packLangs: Set<string>,
  packArtifactIds: Set<string>,
): boolean {
  if (packArtifactIds.size > 0) return packArtifactIds.has(a.id);
  const lang = a.frontmatter.language as string | undefined;
  return lang !== undefined && packLangs.has(lang);
}

/** Expands the `pack:<name>` selector to its member artifact ids, added via `addId`. */
function expandPackSelector(
  packName: string,
  catalog: ResolvedCatalog,
  packs: Pack[],
  addId: (id: string) => void,
): void {
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
    .filter(a => matchesPackMembership(a, packLangs, packArtifactIds))
    .forEach(a => addId(a.id));
}

/** Strips a known `<kind>:` prefix from a selector (e.g. "skill:foo/bar" → "foo/bar"). */
function stripKindPrefix(selector: string): string {
  for (const k of KIND_ORDER) {
    if (selector.startsWith(`${k}:`)) return selector.slice(`${k}:`.length);
  }
  return selector;
}

/** Expands the `kind:<kind>` selector to every artifact of that kind, added via `addId`. */
function expandKindSelector(
  kind: string,
  catalog: ResolvedCatalog,
  addId: (id: string) => void,
): void {
  catalog.artifacts.filter(a => a.kind === kind).forEach(a => addId(a.id));
}

/** Resolves a bare-id or kind-prefixed selector (e.g. "skill:foo/bar", "foo/bar") via `addId`. */
function resolveBareIdSelector(
  selector: string,
  catalog: ResolvedCatalog,
  addId: (id: string) => void,
): void {
  const id = stripKindPrefix(selector);
  if (!catalog.byId.has(id)) {
    throw new Error(`Artifact '${id}' not found. Run \`sigil list\` to see available artifacts.`);
  }
  addId(id);
}

/** Resolves one raw selector string (all/pack:/kind:/kind-prefixed/bare-id) via `addId`. */
function resolveOneSelector(
  selector: string,
  catalog: ResolvedCatalog,
  packs: Pack[],
  addId: (id: string) => void,
): void {
  if (selector === 'all') {
    catalog.artifacts.forEach(a => addId(a.id));
    return;
  }

  if (selector.startsWith('pack:')) {
    expandPackSelector(selector.slice('pack:'.length), catalog, packs, addId);
    return;
  }

  if (selector.startsWith('kind:')) {
    expandKindSelector(selector.slice('kind:'.length), catalog, addId);
    return;
  }

  // kind-prefixed: "skill:csharp/xunit-testing", "agent:shared/code-reviewer", etc.
  resolveBareIdSelector(selector, catalog, addId);
}

/** Resolves every selector string into a de-duped, order-preserving list of artifact IDs. */
function resolveSelectorsToIds(
  selectors: string[],
  catalog: ResolvedCatalog,
  packs: Pack[],
): string[] {
  const candidateIds: string[] = [];
  const seen = new Set<string>();
  const addId = (id: string): void => {
    if (!seen.has(id)) {
      seen.add(id);
      candidateIds.push(id);
    }
  };

  for (const selector of selectors) {
    resolveOneSelector(selector, catalog, packs, addId);
  }
  return candidateIds;
}

/** True when `a` survives the --language filter (agnostic artifacts always survive). */
function matchesLanguageFilter(a: ResolvedArtifact, language: string | undefined): boolean {
  if (!language) return true;
  const lang = artifactLanguage(a);
  return lang === language || lang === undefined;
}

/** Applies --kind / --exclude / --language filters to the candidate artifact list. */
function applySelectionFilters(
  candidates: ResolvedArtifact[],
  filters: SelectionFilters,
): ResolvedArtifact[] {
  const kindSet = filters.kinds && filters.kinds.length > 0 ? new Set(filters.kinds) : undefined;
  const excludeSet =
    filters.exclude && filters.exclude.length > 0 ? new Set(filters.exclude) : undefined;

  return candidates.filter(
    a =>
      (!kindSet || kindSet.has(a.kind)) &&
      (!excludeSet || !excludeSet.has(a.kind)) &&
      matchesLanguageFilter(a, filters.language),
  );
}

const skipOf = (
  a: ResolvedArtifact,
  cause: SkippedArtifact['cause'],
  reason: string,
): SkippedArtifact => ({
  id: a.id,
  kind: a.kind,
  cause,
  reason,
});

/** Why a `via` kind is skipped when picked on its own: it travels inside other artifacts. */
const carriedReason = (kind: string) =>
  `a ${kind} is delivered inside the skills that use it for this target, not on its own`;

/** Classifies one candidate as target-unsupported or platform-restricted, else undefined. */
function classifySkippedArtifact(
  a: ResolvedArtifact,
  sets: { supportedSet: Set<string> | undefined; carriedSet: Set<string> },
  targetName: string | undefined,
): SkippedArtifact | undefined {
  if (sets.carriedSet.has(a.kind)) return skipOf(a, 'kind', carriedReason(a.kind));
  if (sets.supportedSet && !sets.supportedSet.has(a.kind)) {
    return skipOf(a, 'kind', `kind '${a.kind}' is not supported for this target`);
  }
  if (targetName && !artifactTargetsPlatform(a, targetName)) {
    const restricted = (a.frontmatter.platforms as string[]).join(', ');
    return skipOf(a, 'platform', `restricted to platforms: [${restricted}]`);
  }
  return undefined;
}

/** Partitions filtered candidates into target-supported ids vs. skipped (kind/platform). */
function partitionSupportedAndSkipped(
  candidates: ResolvedArtifact[],
  kinds: {
    supported?: readonly ArtifactKind[] | undefined;
    carried?: readonly ArtifactKind[] | undefined;
  },
  targetName: string | undefined,
): SelectionResult {
  const supportedSet = kinds.supported ? new Set<string>(kinds.supported) : undefined;
  const carriedSet = new Set<string>(kinds.carried ?? []);
  const result: SelectionResult = { ids: [], skipped: [] };
  for (const a of candidates) {
    const skip = classifySkippedArtifact(a, { supportedSet, carriedSet }, targetName);
    if (skip) result.skipped.push(skip);
    else result.ids.push(a.id);
  }
  return result;
}

/** Parameters for {@link resolveSelection}. */
export interface ResolveSelectionOptions {
  /** Raw selector strings from the CLI (e.g. 'all', 'pack:dotnet-pack'). */
  selectors: string[];
  /** --kind/--exclude/--language flags. */
  filters: SelectionFilters;
  /** Resolved catalog (all artifacts must be present). */
  catalog: ResolvedCatalog;
  /** Pack list from packs.yaml. */
  packs: Pack[];
  /**
   * Kinds the chosen target can scaffold (its capability table). Omit for no kind filter (the
   * wizard previews selections before a target is applied); `[]` means the target supports nothing.
   */
  supportedKinds?: readonly ArtifactKind[] | undefined;
  /** Kinds the target delivers only inside other artifacts (`via`), skipped with that reason. */
  carriedKinds?: readonly ArtifactKind[] | undefined;
  /** Optional platform name — used to apply platform restriction. */
  targetName?: string;
}

/** Resolve a list of selector strings + filters into a concrete set of artifact IDs. */
export function resolveSelection(options: ResolveSelectionOptions): SelectionResult {
  const { selectors, filters, catalog, packs, supportedKinds, carriedKinds, targetName } = options;
  const candidateIds = resolveSelectorsToIds(selectors, catalog, packs);
  // Every id in candidateIds was added via addId() from either catalog.artifacts directly
  // or after an explicit catalog.byId.has(id) check, so this lookup cannot miss — the
  // type-guard filter (rather than a `!` assertion) keeps that guarantee checked, not asserted.
  const candidates: ResolvedArtifact[] = candidateIds
    .map(id => catalog.byId.get(id))
    .filter((a): a is ResolvedArtifact => a !== undefined);
  const filtered = applySelectionFilters(candidates, filters);
  const kinds = { supported: supportedKinds, carried: carriedKinds };
  const partitioned = partitionSupportedAndSkipped(filtered, kinds, targetName);
  const deduped = dropInlinedBaseRules(partitioned.ids, catalog);
  return { ids: deduped.ids, skipped: [...partitioned.skipped, ...deduped.skipped] };
}
