/**
 * §10 (warning): a live artifact's `extends`/`uses.rules`/`uses.agents`/`template` references a
 * `deprecated:` artifact. Never an error — deprecated artifacts stay fully resolvable so existing
 * installs and dependents keep working (see schema/shared.ts's DeprecatedSchema header) — but a
 * catalog author should know their artifact is quietly depending on a retired one.
 */
import type { Artifact } from '../types';
import type { ValidateCtx } from './types';
import type { Deprecated } from '../schema/index';

/** One (field, ref) pair to check for deprecation, mirroring refs.ts's field list. */
function referencedIds(artifact: Artifact): { field: string; ref: string }[] {
  const fm = artifact.frontmatter;
  const extendsRefs = (fm.extends as string[] | undefined) ?? [];
  const uses = fm.uses as { rules?: string[]; agents?: string[] } | undefined;
  const templateRef = fm.template as string | undefined;

  return [
    ...extendsRefs.map(ref => ({ field: 'extends', ref })),
    ...(uses?.rules ?? []).map(ref => ({ field: 'uses.rules', ref })),
    ...(uses?.agents ?? []).map(ref => ({ field: 'uses.agents', ref })),
    ...(templateRef ? [{ field: 'template', ref: templateRef }] : []),
  ];
}

/** §10: warns once per reference to a deprecated artifact. */
export function checkDeprecatedReferences(ctx: ValidateCtx, artifact: Artifact): void {
  for (const { field, ref } of referencedIds(artifact)) {
    const target = ctx.catalog.byId.get(ref);
    const deprecated = target?.frontmatter.deprecated as Deprecated | undefined;
    if (!deprecated) continue;

    const replacement = deprecated.supersededBy
      ? ` — use '${deprecated.supersededBy}' instead`
      : '';
    ctx.warnings.push(
      `[${artifact.id}] ${field}: '${ref}' is deprecated since ${deprecated.since} ` +
        `(${deprecated.reason})${replacement}.`,
    );
  }
}
