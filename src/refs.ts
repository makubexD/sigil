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

export type RefField = 'extends' | 'uses.rules' | 'uses.agents';

export interface RefCheck {
  /** Which frontmatter field this reference came from. */
  readonly field: RefField;
  /** The referenced artifact id. */
  readonly ref: string;
  /** 'dangling' = id not in the catalog; 'wrong-kind' = id exists but is the wrong kind. */
  readonly problem: 'dangling' | 'wrong-kind';
  /** Set only when problem === 'wrong-kind'. */
  readonly actualKind?: string;
}

const EXPECTED_KIND: Record<RefField, string> = {
  extends: 'rule',
  'uses.rules': 'rule',
  'uses.agents': 'agent',
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
 * Checks an artifact's `extends`, `uses.rules`, and `uses.agents` frontmatter fields
 * against the catalog. Returns one `RefCheck` per problem found (empty = clean).
 */
export function checkReferences(
  frontmatter: Record<string, unknown>,
  catalog: LoadedCatalog,
): RefCheck[] {
  const extendsRefs = (frontmatter.extends as string[] | undefined) ?? [];
  const uses = frontmatter.uses as { rules?: string[]; agents?: string[] } | undefined;

  return [
    ...checkField('extends', extendsRefs, catalog),
    ...checkField('uses.rules', uses?.rules ?? [], catalog),
    ...checkField('uses.agents', uses?.agents ?? [], catalog),
  ];
}
