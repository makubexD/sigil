/**
 * Reference-graph walk shared by validate.ts and authoring/check-source.ts.
 *
 * Both modules independently re-implemented the same "does this id exist, and is it
 * the right kind" check for `extends`, `uses.rules`, and `uses.agents` — with slightly
 * different wording on each error. That duplication is a latent-divergence risk: the
 * validation *rule* (only rules can be extended, only rules go in uses.rules, only
 * agents go in uses.agents) was stated in two places instead of one.
 *
 * This module owns the walk; each caller keeps its own error shape/wording by mapping
 * over the returned `RefCheck[]`.
 *
 * @module
 */
import type { LoadedCatalog } from './types';

export type RefField = 'extends' | 'uses.rules' | 'uses.agents' | 'template' | 'claude.skills';

export interface RefCheck {
  /** Which frontmatter field this reference came from. */
  readonly field: RefField;
  /** The referenced artifact id. */
  readonly ref: string;
  /**
   * 'dangling' = id not in the catalog; 'wrong-kind' = id exists but is the wrong kind;
   * 'name-mismatch' = a preloaded skill whose `name` isn't its id's last segment (the Claude
   * adapter emits that segment as the skill name, so the preload would name a missing skill).
   */
  readonly problem: 'dangling' | 'wrong-kind' | 'name-mismatch';
  /** Set only when problem === 'wrong-kind'. */
  readonly actualKind?: string;
  /** Set only when problem === 'name-mismatch'. */
  readonly actualName?: string;
}

/** Why a wrong-kind reference is wrong, per field (shared by validate and sigil check). */
export const REF_VALIDITY_NOTE: Record<RefField, string> = {
  extends: 'only rules can be extended',
  'uses.rules': 'only rules are valid here',
  'uses.agents': 'only agents are valid here',
  template: 'only kind: template artifacts are valid here',
  'claude.skills': 'only skills can be preloaded',
};

/** Renders a RefCheck's problem after the field/ref prefix each caller adds. */
export function describeRefProblem(check: RefCheck): string {
  if (check.problem === 'dangling') return 'does not exist in the catalog';
  if (check.problem === 'name-mismatch') {
    return `is named '${check.actualName}'; a preloaded skill's name must be its id's last segment`;
  }
  return `has kind '${check.actualKind}' — ${REF_VALIDITY_NOTE[check.field]}`;
}

/** The skill ids an agent preloads (`claude: { skills }`). */
export function preloadedSkillIds(frontmatter: Record<string, unknown>): string[] {
  return (frontmatter.claude as { skills?: string[] } | undefined)?.skills ?? [];
}

/** Preloaded skills whose name differs from the last segment of their id. */
function checkPreloadNames(refs: string[], catalog: LoadedCatalog): RefCheck[] {
  return refs.flatMap(ref => {
    const name = catalog.byId.get(ref)?.frontmatter.name;
    const expected = ref.slice(ref.lastIndexOf('/') + 1);
    if (typeof name !== 'string' || name === expected) return [];
    return [
      { field: 'claude.skills' as const, ref, problem: 'name-mismatch' as const, actualName: name },
    ];
  });
}

const EXPECTED_KIND: Record<RefField, string> = {
  extends: 'rule',
  'uses.rules': 'rule',
  'uses.agents': 'agent',
  template: 'template',
  'claude.skills': 'skill',
};

/** Walk one reference field, checking each id against `catalog` and the expected kind. */
function checkField(field: RefField, refs: string[], catalog: LoadedCatalog): RefCheck[] {
  const checks: RefCheck[] = [];
  const expectedKind = EXPECTED_KIND[field];
  for (const ref of refs) {
    const target = catalog.byId.get(ref);
    if (!target) {
      checks.push({ field, ref, problem: 'dangling' });
    } else if (target.kind !== expectedKind) {
      checks.push({ field, ref, problem: 'wrong-kind', actualKind: target.kind });
    }
  }
  return checks;
}

/**
 * Checks an artifact's `extends`, `uses.rules`, `uses.agents`, `template`, and `claude.skills` fields
 * against the catalog. Returns one `RefCheck` per problem found (empty = clean).
 */
export function checkReferences(
  frontmatter: Record<string, unknown>,
  catalog: LoadedCatalog,
): RefCheck[] {
  const extendsRefs = (frontmatter.extends as string[] | undefined) ?? [];
  const uses = frontmatter.uses as { rules?: string[]; agents?: string[] } | undefined;
  const templateRef = frontmatter.template as string | undefined;
  const claudeSkills = preloadedSkillIds(frontmatter);

  return [
    ...checkField('extends', extendsRefs, catalog),
    ...checkField('uses.rules', uses?.rules ?? [], catalog),
    ...checkField('uses.agents', uses?.agents ?? [], catalog),
    ...checkField('template', templateRef ? [templateRef] : [], catalog),
    ...checkField('claude.skills', claudeSkills, catalog),
    ...checkPreloadNames(claudeSkills, catalog),
  ];
}
