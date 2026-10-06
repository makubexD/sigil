/**
 * The anatomy half of `family-skeleton` (docs/decisions/family-skeleton-standard-2026-10.md): what
 * `catalog/standard.yaml` says a family member looks like beyond its sections.
 *   - keys: a member sets exactly the family's `keys`, besides the fields every artifact has and
 *     the ones other checks own (`OWN_KEYS`);
 *   - title: a language member is titled `<family title> (<language displayName>)`;
 *   - references: a member carries exactly the reference files its family declares (one
 *     `stack-<id>.md` per declared stack when `stacks` is set), and a skill's stack files share one
 *     H2 skeleton;
 *   - uses: members load rules and agents from the same families.
 *
 * @module
 */
import type { Artifact, LanguageMetadata } from '../../../../types';
import type { CatalogStandard, FamilyDef } from '../../../../catalog-standard';
import { BaseFields } from '../../../../schema/shared';
import { h2Headings, sectionKey } from '../../../../markdown-headings';

/** Fields every artifact has, and fields other checks own (`uses` parity, layout, templates). */
const OWN_KEYS = new Set([
  ...Object.keys(BaseFields),
  'name',
  'language',
  'template',
  'uses',
  'extends',
]);
const STACK_FILE_RE = /^stack-.+\.md$/;

/** A required key the member lacks, and a key it sets that its family does not declare. */
export function keyProblems(family: FamilyDef, artifact: Artifact): string[] {
  const declared = new Set(family.keys);
  const missing = family.keys
    .filter(key => artifact.frontmatter[key] === undefined)
    .map(key => `family '${family.id}' requires the frontmatter key '${key}'`);
  const extra = Object.keys(artifact.frontmatter)
    .filter(key => !OWN_KEYS.has(key) && !declared.has(key))
    .map(key => `family '${family.id}' does not declare the frontmatter key '${key}'`);
  return [...missing, ...extra];
}

/** A language member whose title is not `<family title> (<displayName>)`. */
export function titleProblems(
  family: FamilyDef,
  artifact: Artifact,
  languages: ReadonlyMap<string, LanguageMetadata>,
): string[] {
  const language = languages.get(artifact.id.split('/')[0] ?? '');
  if (!family.title || !language) return [];
  const want = `${family.title} (${language.displayName})`;
  return artifact.frontmatter.title === want ? [] : [`family '${family.id}' titles it '${want}'`];
}

/** The reference file names (`<name>.md`) `family` declares for `memberId`. */
function declaredReferences(
  family: FamilyDef,
  memberId: string,
  standard: CatalogStandard,
): Set<string> {
  const refs = family.references;
  const names = [...Object.keys(refs?.files ?? {}), ...Object.keys(refs?.members[memberId] ?? {})];
  const stackFiles = refs?.stacks ? standard.stacks.map(stack => `stack-${stack.id}`) : [];
  return new Set([...names, ...stackFiles].map(name => `${name}.md`));
}

/** A reference file the family does not declare, and a declared one the member lacks. */
export function referenceProblems(
  family: FamilyDef,
  artifact: Artifact,
  standard: CatalogStandard,
): string[] {
  const declared = declaredReferences(family, artifact.id, standard);
  const actual = new Set((artifact.references ?? []).map(ref => ref.name));
  const extra = [...actual].filter(name => !declared.has(name));
  const missing = [...declared].filter(name => !actual.has(name));
  return [
    ...extra.map(name => `family '${family.id}' does not declare the reference '${name}'`),
    ...missing.map(name => `family '${family.id}' requires the reference '${name}'`),
  ];
}

/** Where `headings` first leaves `skeleton` (both H2 lists), named against `firstName`. */
function stackDrift(skeleton: string[], headings: string[], firstName: string): string | undefined {
  const length = Math.max(skeleton.length, headings.length);
  for (let i = 0; i < length; i++) {
    const want = skeleton[i];
    const got = headings[i];
    if (want !== undefined && got !== undefined && sectionKey(want) === sectionKey(got)) continue;
    if (got === undefined) return `missing section "${want}" that ${firstName} has`;
    if (want === undefined) return `section "${got}" that ${firstName} does not have`;
    return `section "${got}" where ${firstName} has "${want}"`;
  }
  return undefined;
}

/** A skill's stack files share one H2 skeleton: the first one's, by name order. */
export function stackSkeletonProblems(artifact: Artifact): string[] {
  const stackFiles = (artifact.references ?? [])
    .filter(ref => STACK_FILE_RE.test(ref.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const [first, ...rest] = stackFiles;
  if (!first) return [];
  const skeleton = h2Headings(first.content);
  return rest.flatMap(ref => {
    const drift = stackDrift(skeleton, h2Headings(ref.content), first.name);
    return drift ? [`references/${ref.name}: ${drift}`] : [];
  });
}

/** The families a member's `uses.<field>` ids belong to, sorted (an id in no family as itself). */
function usesFamilies(
  artifact: Artifact,
  field: 'rules' | 'agents',
  familyOf: ReadonlyMap<string, string>,
): string {
  const uses = artifact.frontmatter.uses as Record<string, unknown> | undefined;
  const ids = Array.isArray(uses?.[field]) ? (uses[field] as unknown[]) : [];
  const families = ids.filter((id): id is string => typeof id === 'string');
  return [...new Set(families.map(id => familyOf.get(id) ?? id))].sort().join(', ') || 'none';
}

/** Members whose `uses` rules or agents come from other families than the first member's. */
export function usesProblems(
  family: FamilyDef,
  members: readonly Artifact[],
  familyOf: ReadonlyMap<string, string>,
): Array<{ artifact: Artifact; detail: string }> {
  const [first, ...rest] = members;
  if (!first) return [];
  return rest.flatMap(artifact =>
    (['rules', 'agents'] as const).flatMap(field => {
      const want = usesFamilies(first, field, familyOf);
      const got = usesFamilies(artifact, field, familyOf);
      if (want === got) return [];
      const detail = `family '${family.id}': loads ${field} from ${got} where ${first.id} loads ${want}`;
      return [{ artifact, detail }];
    }),
  );
}
