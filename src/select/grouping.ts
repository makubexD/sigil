/**
 * Artifact grouping, availability filtering, and config-kind partitioning.
 *
 * groupArtifactsByLanguage — bucket for the wizard's grouped-multiselect picker
 * availableKinds           — distinct kinds present in an artifact array (in KIND_ORDER)
 * buildLanguageOptions     — option list for the "Narrow by language?" wizard step
 * partitionConfigKinds     — split config kinds (hook/settings/mcp) from code artifacts
 */
import type { ResolvedArtifact, ArtifactKind } from '../types';
import { KIND_ORDER, CONFIG_KINDS, artifactLanguage } from './selection';

/**
 * Returns the distinct artifact kinds present in the given array, in KIND_ORDER.
 * Used by the wizard to build "By kind" option lists from only the artifact kinds
 * that are actually available (after target.supportedKinds filtering).
 */
export function availableKinds(artifacts: ResolvedArtifact[]): ArtifactKind[] {
  const present = new Set(artifacts.map(a => a.kind));
  return KIND_ORDER.filter(k => present.has(k));
}

/**
 * Builds a language-filter option list from an artifact array.
 *
 * Returns `[]` when the array has no language-tagged artifacts (caller skips the prompt).
 * Each option carries a count hint reflecting the passed subset.
 */
export function buildLanguageOptions(
  artifacts: ResolvedArtifact[],
): Array<{ value: string; label: string; hint: string }> {
  const langs = [
    ...new Set(
      artifacts
        .map(a => artifactLanguage(a))
        .filter((l): l is string => Boolean(l))
        .sort(),
    ),
  ];
  if (langs.length === 0) return [];
  return [
    { value: '', label: 'All languages', hint: langs.join(', ') },
    ...langs.map(l => {
      const count = artifacts.filter(a => artifactLanguage(a) === l).length;
      return { value: l, label: l, hint: `${count} artifact${count !== 1 ? 's' : ''}` };
    }),
  ];
}

/**
 * Groups artifacts by language for the grouped-multiselect picker in the wizard.
 *
 * When `language` is supplied (non-empty string), only that language's artifacts
 * plus shared (language-undefined) artifacts are included — mirrors the language
 * filter in `resolveSelection`.
 *
 * Group keys: `frontmatter.language`, or `'shared'` for language-undefined artifacts.
 * Group order: real languages alphabetical, `'shared'` last.
 * Within each group: sorted by kind (skill → agent → rule → prompt → workflow) then id.
 *
 * Returns a plain ordered Record suitable for `@clack/prompts` `groupMultiselect`.
 */
export function groupArtifactsByLanguage(
  artifacts: ResolvedArtifact[],
  language?: string,
): Record<string, ResolvedArtifact[]> {
  const filtered = language
    ? artifacts.filter(a => {
        const lang = artifactLanguage(a);
        return lang === language || lang === undefined;
      })
    : artifacts;

  const buckets = new Map<string, ResolvedArtifact[]>();
  for (const a of filtered) {
    const key = artifactLanguage(a) ?? 'shared';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(a);
  }

  const kindIndex: Record<string, number> = Object.fromEntries(KIND_ORDER.map((k, i) => [k, i]));
  for (const group of buckets.values()) {
    group.sort((a, b) => {
      const ki = (kindIndex[a.kind] ?? 99) - (kindIndex[b.kind] ?? 99);
      return ki !== 0 ? ki : a.id.localeCompare(b.id);
    });
  }

  const sortedKeys = [...buckets.keys()].sort((a, b) => {
    if (a === 'shared') return 1;
    if (b === 'shared') return -1;
    return a.localeCompare(b);
  });

  const result: Record<string, ResolvedArtifact[]> = {};
  for (const key of sortedKeys) {
    result[key] = buckets.get(key)!;
  }
  return result;
}

/**
 * Split an artifact array into config-kind artifacts and everything else.
 *
 * Config kinds (hook / settings / mcp) are language-agnostic: they always
 * appear in the wizard's "Config — agnostic" group regardless of any language
 * filter, and must not be mixed into the language-bucketed groups.
 *
 * `config` is sorted by KIND_ORDER then id.
 * `rest` preserves the input order.
 */
export function partitionConfigKinds(artifacts: ResolvedArtifact[]): {
  config: ResolvedArtifact[];
  rest: ResolvedArtifact[];
} {
  const kindIndex: Record<string, number> = Object.fromEntries(KIND_ORDER.map((k, i) => [k, i]));
  const config = artifacts
    .filter(a => CONFIG_KINDS.has(a.kind))
    .sort((a, b) => {
      const ki = (kindIndex[a.kind] ?? 99) - (kindIndex[b.kind] ?? 99);
      return ki !== 0 ? ki : a.id.localeCompare(b.id);
    });
  const rest = artifacts.filter(a => !CONFIG_KINDS.has(a.kind));
  return { config, rest };
}
