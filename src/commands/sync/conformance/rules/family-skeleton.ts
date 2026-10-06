/**
 * `family-skeleton` — the enforcement of "one family, one skeleton"
 * (docs/decisions/family-skeleton-standard-2026-10.md). `catalog/standard.yaml` declares each
 * family's members and, optionally, the H2 sections every member has in order and the frontmatter
 * keys every member sets. This rule fails `sync --check` when:
 *   - the data is wrong: a member that is not in the catalog, of another kind, or in two families;
 *   - a member's sections drift from the skeleton (step numbering is ignored, optional sections may
 *     be left out; anything language-specific goes under an H3 inside a skeleton section). A
 *     member with a `template:` takes its sections from the template and is not compared;
 *   - a member lacks a required frontmatter key, or drifts from the anatomy in family-anatomy.ts
 *     (exact keys, title, reference files, stack-file skeleton, `uses` families).
 * An agent, rule or skill that belongs to no family, and is not a declared base, is an error too.
 *
 * Author-only, like `catalog-layout`: a catalog without `standard.yaml`, or built in memory, is
 * skipped.
 *
 * @module
 */
import type { Artifact, LanguageMetadata, LoadedCatalog } from '../../../../types';
import type { ConformanceRule, ConformanceFinding } from '../types';
import {
  loadCatalogStandard,
  STANDARD_FILE,
  type CatalogStandard,
  type FamilyDef,
  type SkeletonSection,
} from '../../../../catalog-standard';
import { h2Headings, sectionKey } from '../../../../markdown-headings';
import {
  keyProblems,
  referenceProblems,
  stackSkeletonProblems,
  titleProblems,
  usesProblems,
} from './family-anatomy';

const RULE_ID = 'family-skeleton';
const FAMILY_KINDS = new Set(['agent', 'rule', 'skill']);

/** The first place `headings` leaves `skeleton`, or undefined when they agree. */
export function skeletonDrift(
  skeleton: readonly SkeletonSection[],
  headings: readonly string[],
): string | undefined {
  let s = 0;
  for (const heading of headings) {
    while (s < skeleton.length && sectionKey(skeleton[s]!.heading) !== sectionKey(heading)) {
      if (!skeleton[s]!.optional) {
        return `expected section "${skeleton[s]!.heading}" where "${heading}" is`;
      }
      s++;
    }
    if (s === skeleton.length) return `section "${heading}" is not in the family skeleton`;
    s++;
  }
  const missing = skeleton.slice(s).find(section => !section.optional);
  return missing ? `missing section "${missing.heading}"` : undefined;
}

function finding(detail: string, artifact?: Artifact): ConformanceFinding {
  const base = { ruleId: RULE_ID, severity: 'error' as const, detail };
  return artifact ? { ...base, artifactId: artifact.id, filePath: artifact.filePath } : base;
}

/** What the member checks read: the standard and the catalog's languages. */
interface StandardContext {
  readonly standard: CatalogStandard;
  readonly languages: ReadonlyMap<string, LanguageMetadata>;
}

/** Problems with one member: its kind, keys, title, sections and reference files. */
function memberProblems(family: FamilyDef, artifact: Artifact, ctx: StandardContext): string[] {
  if (artifact.kind !== family.kind) {
    return [`is a ${artifact.kind}, but family '${family.id}' is a ${family.kind} family`];
  }
  const problems = [
    ...keyProblems(family, artifact),
    ...titleProblems(family, artifact, ctx.languages),
    ...referenceProblems(family, artifact, ctx.standard),
    ...stackSkeletonProblems(artifact),
  ];
  // A templated member's body is slot content; its sections come from the template, which every
  // member shares, so there is nothing per member to compare.
  const templated = artifact.frontmatter.template !== undefined;
  const drift =
    family.sections && !templated && skeletonDrift(family.sections, h2Headings(artifact.body));
  if (drift) problems.push(`family '${family.id}': ${drift}`);
  return problems;
}

/** Findings for one family's members, recording each seen member in `seen`. */
function familyFindings(
  family: FamilyDef,
  byId: ReadonlyMap<string, Artifact>,
  seen: Map<string, string>,
  ctx: StandardContext,
): ConformanceFinding[] {
  return family.members.flatMap(id => {
    const artifact = byId.get(id);
    if (!artifact) {
      return [finding(`${STANDARD_FILE}: family '${family.id}' lists '${id}', not in the catalog`)];
    }
    const first = seen.get(id);
    seen.set(id, first ?? family.id);
    if (first) {
      return [finding(`is listed in families '${first}' and '${family.id}'`, artifact)];
    }
    return memberProblems(family, artifact, ctx).map(detail => finding(detail, artifact));
  });
}

/** Members of each family that load rules or agents from other families than their siblings. */
function usesFindings(
  standard: CatalogStandard,
  byId: ReadonlyMap<string, Artifact>,
): ConformanceFinding[] {
  const familyOf = new Map(standard.families.flatMap(f => f.members.map(id => [id, f.id])));
  return standard.families.flatMap(family => {
    const members = family.members.flatMap(id => byId.get(id) ?? []);
    return usesProblems(family, members, familyOf).map(p => finding(p.detail, p.artifact));
  });
}

/** Agents, rules and skills that no family lists and that are not a declared base. */
function unassigned(
  artifacts: readonly Artifact[],
  seen: ReadonlyMap<string, string>,
  bases: readonly string[],
) {
  return artifacts
    .filter(a => FAMILY_KINDS.has(a.kind) && !seen.has(a.id) && !bases.includes(a.id))
    .map(a => finding(`belongs to no family in ${STANDARD_FILE}`, a));
}

/** Every finding for `standard` against `catalog`. */
export function standardFindings(
  standard: CatalogStandard,
  catalog: Pick<LoadedCatalog, 'artifacts' | 'byId' | 'languages'>,
): ConformanceFinding[] {
  const seen = new Map<string, string>();
  const ctx = { standard, languages: catalog.languages };
  const found = standard.families.flatMap(f => familyFindings(f, catalog.byId, seen, ctx));
  return [
    ...found,
    ...usesFindings(standard, catalog.byId),
    ...unassigned(catalog.artifacts, seen, standard.bases),
  ];
}

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  const { catalog } = ctx;
  if (!catalog.root) return [];
  const standard = loadCatalogStandard(catalog.root);
  if (!standard) return [];
  return standardFindings(standard, catalog);
}

export const familySkeletonRule: ConformanceRule = {
  id: RULE_ID,
  title: 'Every member of a family has the family skeleton',
  class: 'editorial',
  appliesTo: { kinds: ['agent', 'rule', 'skill'] },
  rationale:
    'One family, one skeleton: the language versions of an agent, rule or skill share their ' +
    'sections and keys, so they cannot drift apart and every target renders the same structure.',
  detect,
};
