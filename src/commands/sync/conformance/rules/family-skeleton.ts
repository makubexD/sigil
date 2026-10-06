/**
 * `family-skeleton` — the enforcement of "one family, one skeleton"
 * (docs/decisions/family-skeleton-standard-2026-10.md). `catalog/standard.yaml` declares each
 * family's members and, optionally, the H2 sections every member has in order and the frontmatter
 * keys every member sets. This rule fails `sync --check` when:
 *   - the data is wrong: a member that is not in the catalog, of another kind, or in two families;
 *   - a member's sections drift from the skeleton (step numbering is ignored, optional sections may
 *     be left out; anything language-specific goes under an H3 inside a skeleton section);
 *   - a member lacks a required frontmatter key.
 * A language-namespace agent, rule or skill that belongs to no family is a warning.
 *
 * Author-only, like `catalog-layout`: a catalog without `standard.yaml`, or built in memory, is
 * skipped.
 *
 * @module
 */
import type { Artifact } from '../../../../types';
import type { ConformanceRule, ConformanceFinding } from '../types';
import {
  loadCatalogStandard,
  STANDARD_FILE,
  type CatalogStandard,
  type FamilyDef,
  type SkeletonSection,
} from '../../../../catalog-standard';
import { h2Headings, sectionKey } from '../../../../markdown-headings';
import { SHARED_NAMESPACE } from '../../../../catalog-layout';

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

function finding(
  detail: string,
  artifact?: Artifact,
  severity: 'error' | 'warning' = 'error',
): ConformanceFinding {
  const base = { ruleId: RULE_ID, severity, detail };
  return artifact ? { ...base, artifactId: artifact.id, filePath: artifact.filePath } : base;
}

/** Problems with one member: its kind, its keys, its sections. */
function memberProblems(family: FamilyDef, artifact: Artifact): string[] {
  if (artifact.kind !== family.kind) {
    return [`is a ${artifact.kind}, but family '${family.id}' is a ${family.kind} family`];
  }
  const problems = family.keys
    .filter(key => artifact.frontmatter[key] === undefined)
    .map(key => `family '${family.id}' requires the frontmatter key '${key}'`);
  const drift = family.sections && skeletonDrift(family.sections, h2Headings(artifact.body));
  if (drift) problems.push(`family '${family.id}': ${drift}`);
  return problems;
}

/** Findings for one family's members, recording each seen member in `seen`. */
function familyFindings(
  family: FamilyDef,
  byId: ReadonlyMap<string, Artifact>,
  seen: Map<string, string>,
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
    return memberProblems(family, artifact).map(detail => finding(detail, artifact));
  });
}

/** Language-namespace agents, rules and skills that no family lists. */
function unassigned(artifacts: readonly Artifact[], seen: ReadonlyMap<string, string>) {
  return artifacts
    .filter(a => FAMILY_KINDS.has(a.kind) && !a.id.startsWith(`${SHARED_NAMESPACE}/`))
    .filter(a => !seen.has(a.id))
    .map(a => finding(`belongs to no family in ${STANDARD_FILE}`, a, 'warning'));
}

/** Every finding for `standard` against the catalog's artifacts. */
export function standardFindings(
  standard: CatalogStandard,
  artifacts: readonly Artifact[],
  byId: ReadonlyMap<string, Artifact>,
): ConformanceFinding[] {
  const seen = new Map<string, string>();
  const found = standard.families.flatMap(family => familyFindings(family, byId, seen));
  return [...found, ...unassigned(artifacts, seen)];
}

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  const { catalog } = ctx;
  if (!catalog.root) return [];
  const standard = loadCatalogStandard(catalog.root);
  if (!standard) return [];
  return standardFindings(standard, catalog.artifacts, catalog.byId);
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
