/**
 * `catalog-symmetry` — flags an agent/rule/skill "family" (same kind, same base name with the
 * language prefix stripped — e.g. `ts-audit-deps` / `cs-audit-deps` / `ng-audit-deps` share family
 * `audit-deps`) that exists in most fully-built language namespaces but is missing from one.
 *
 * Added by the 2026-08-20 catalog quality audit (docs/decisions/catalog-quality-audit-2026-08.md)
 * after F10: csharp had `cs-api-architect` with no typescript/angular counterpart, angular was
 * missing `*-project-layout`/`*-async`/`*-npm` that typescript and csharp both have. Report-only —
 * whether a gap should be filled, or is a deliberate language-specific artifact, is an editorial
 * call the audit register makes per-family, not something a mechanical fix can decide.
 *
 * When the catalog has `standard.yaml`, families come from its data (declaredFindings) instead of
 * from names, and a family's `absent` entries are deliberate gaps; name-guessing stays for a
 * catalog without one.
 *
 * "Fully-built" is derived live (>= FULL_NAMESPACE_MIN_ARTIFACTS artifacts for that language),
 * never a hand-listed language set — so a new language joins the comparison the day it is built
 * out, with no rule edit required.
 *
 * @module
 */
import type { ConformanceRule, ConformanceFinding, ConformanceContext } from '../types';
import type { ArtifactKind } from '../../../../types';
import {
  loadCatalogStandard,
  type CatalogStandard,
  type FamilyDef,
} from '../../../../catalog-standard';

const FULL_NAMESPACE_MIN_ARTIFACTS = 15;
const MIN_LANGUAGES_TO_COMPARE = 2;
const SYMMETRY_KINDS: readonly ArtifactKind[] = ['agent', 'rule', 'skill'];
const LANG_PREFIX_RE = /^(?:[a-z]{2,3})-/;

type Artifact = ConformanceContext['catalog']['artifacts'][number];
type FamilyMap = Map<ArtifactKind, Map<string, Set<string>>>;

/**
 * Strips this artifact's language prefix from its id's name segment to get the family key.
 *
 * Most languages use a short abbreviation prefix (`cs-`, `ts-`, `ng-`, `py-`) that differs from
 * the `language:` frontmatter value itself (`csharp`, `typescript`, `angular`, `python`) — those
 * are stripped by `LANG_PREFIX_RE`. `react`'s prefix IS its language name (`react-generate-tests`)
 * and is 5 characters, so `LANG_PREFIX_RE`'s `{2,3}` bound never matches it — every react artifact
 * would land in its own singleton family without this check. Try the full `${language}-` prefix
 * first (covers react and any future full-word-prefixed language); fall back to the short-code
 * regex for languages whose prefix isn't their language name.
 */
function familyOf(id: string, language: string | undefined): string {
  const name = id.split('/').pop() ?? id;
  if (language && name.startsWith(`${language}-`)) {
    return name.slice(language.length + 1);
  }
  return name.replace(LANG_PREFIX_RE, '');
}

/** Languages with enough artifacts to count as a "fully-built" namespace worth comparing. */
function fullyBuiltLanguages(artifacts: readonly Artifact[]): string[] {
  const byLanguage = new Map<string, number>();
  for (const a of artifacts) {
    const lang = a.frontmatter.language as string | undefined;
    if (!lang) continue;
    byLanguage.set(lang, (byLanguage.get(lang) ?? 0) + 1);
  }
  return [...byLanguage.entries()]
    .filter(([, count]) => count >= FULL_NAMESPACE_MIN_ARTIFACTS)
    .map(([lang]) => lang)
    .sort();
}

/** Groups fully-built-language artifacts into families[kind][strippedName] = Set<language>. */
function groupFamilies(
  artifacts: readonly Artifact[],
  fullLanguages: readonly string[],
): FamilyMap {
  const families: FamilyMap = new Map();
  for (const a of artifacts) {
    const lang = a.frontmatter.language as string | undefined;
    if (!lang || !fullLanguages.includes(lang) || !SYMMETRY_KINDS.includes(a.kind)) continue;
    const kindMap = families.get(a.kind) ?? new Map<string, Set<string>>();
    families.set(a.kind, kindMap);
    const fam = familyOf(a.id, lang);
    const langs = kindMap.get(fam) ?? new Set<string>();
    kindMap.set(fam, langs);
    langs.add(lang);
  }
  return families;
}

/** Builds one asymmetry finding, or null when `presentIn` is unanimous/singleton (not asymmetric). */
function asymmetryFinding(
  kind: ArtifactKind,
  fam: string,
  presentIn: Set<string>,
  fullLanguages: readonly string[],
): ConformanceFinding | null {
  if (presentIn.size < MIN_LANGUAGES_TO_COMPARE) return null;
  return gapFinding(kind, fam, presentIn, fullLanguages);
}

/** The gap finding for a family present in `presentIn` of `languages`, or null when it is in all. */
function gapFinding(
  kind: ArtifactKind,
  fam: string,
  presentIn: Set<string>,
  languages: readonly string[],
): ConformanceFinding | null {
  const missingFrom = languages.filter(l => !presentIn.has(l));
  if (missingFrom.length === 0) return null;
  return {
    ruleId: 'catalog-symmetry',
    severity: 'warning',
    detail:
      `${kind} family '${fam}' exists for ${[...presentIn].sort().join(', ')} but not ` +
      `${missingFrom.join(', ')} — confirm this is a deliberate language-specific artifact, ` +
      `not a coverage gap`,
  };
}

function asymmetryFindings(
  families: FamilyMap,
  fullLanguages: readonly string[],
): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  for (const [kind, kindMap] of families) {
    for (const [fam, presentIn] of kindMap) {
      const finding = asymmetryFinding(kind, fam, presentIn, fullLanguages);
      if (finding) findings.push(finding);
    }
  }
  return findings.sort((a, b) => a.detail.localeCompare(b.detail));
}

/**
 * Families from `catalog/standard.yaml`: membership is data, so one concern under different names
 * (`cs-nuget`, `py-packaging`, `ts-npm`) is one family, and `absent` records a deliberate gap. A
 * member's language is its id's namespace. An `absent` entry for a language that has a member, or
 * that is not a language at all, is stale and reported.
 */
export function declaredFindings(
  standard: CatalogStandard,
  catalog: ConformanceContext['catalog'],
  fullLanguages: readonly string[],
): ConformanceFinding[] {
  const findings = standard.families
    .filter(family => SYMMETRY_KINDS.includes(family.kind))
    .flatMap(family => familyFindings(family, catalog, fullLanguages));
  return findings.sort((a, b) => a.detail.localeCompare(b.detail));
}

function familyFindings(
  family: FamilyDef,
  catalog: ConformanceContext['catalog'],
  fullLanguages: readonly string[],
): ConformanceFinding[] {
  const memberLanguages = new Set(family.members.map(id => id.split('/')[0] ?? ''));
  const expected = fullLanguages.filter(lang => !Object.hasOwn(family.absent, lang));
  const presentIn = new Set(expected.filter(lang => memberLanguages.has(lang)));
  // A one-member family with no `absent` entries is a language-specific artifact; any other family
  // is compared even when only one non-absent language has a member.
  const singleton = family.members.length === 1 && Object.keys(family.absent).length === 0;
  const gap =
    singleton || presentIn.size === 0
      ? null
      : gapFinding(family.kind, family.id, presentIn, expected);
  const stale = staleAbsentFindings(family, memberLanguages, catalog);
  return gap ? [gap, ...stale] : stale;
}

/** `absent` entries for a language that has a member, or for something that is not a language. */
function staleAbsentFindings(
  family: FamilyDef,
  memberLanguages: ReadonlySet<string>,
  catalog: ConformanceContext['catalog'],
): ConformanceFinding[] {
  return Object.keys(family.absent)
    .filter(lang => memberLanguages.has(lang) || !catalog.languages.has(lang))
    .map(lang => ({
      ruleId: 'catalog-symmetry',
      severity: 'warning' as const,
      detail:
        `${family.kind} family '${family.id}': absent lists ${lang}, which ` +
        (memberLanguages.has(lang) ? 'has a member' : 'is not a language'),
    }));
}

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  const fullLanguages = fullyBuiltLanguages(ctx.catalog.artifacts);
  if (fullLanguages.length < MIN_LANGUAGES_TO_COMPARE) return [];
  const standard = ctx.catalog.root ? loadCatalogStandard(ctx.catalog.root) : undefined;
  if (standard) return declaredFindings(standard, ctx.catalog, fullLanguages);
  const families = groupFamilies(ctx.catalog.artifacts, fullLanguages);
  return asymmetryFindings(families, fullLanguages);
}

export const catalogSymmetryRule: ConformanceRule = {
  id: 'catalog-symmetry',
  title: 'An artifact family should exist uniformly across fully-built language namespaces',
  class: 'editorial',
  appliesTo: { kinds: SYMMETRY_KINDS },
  rationale:
    'A family present in most language namespaces but missing from one is usually an unnoticed ' +
    'coverage gap (docs/decisions/catalog-quality-audit-2026-08.md F10), not a deliberate omission. ' +
    'Families come from catalog/standard.yaml, where `absent` records a deliberate gap.',
  detect,
};
