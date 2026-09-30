/**
 * §1 (schema conformance) and §2 (reference-graph integrity) checks.
 */
import { z } from 'zod';
import type { Artifact, ArtifactKind, Target } from '../types';
import { getSchema } from '../schema/index';
import { checkReferences, describeRefProblem, type RefCheck } from '../refs';
import type { ValidateCtx } from './types';

/**
 * Composes the effective schema for one artifact: the kind's neutral schema, extended with an
 * optional `<target.name>: {...}` field for every registered target that declares
 * `frontmatterExtensions` for this kind (see Target.frontmatterExtensions in types.ts).
 *
 * This is the one place stage-2 (validate) reads provider-specific shape — and it does so
 * generically, by iterating the target registry, never by naming a provider. That keeps the
 * platform-neutral pipeline invariant intact while still catching malformed `claude:` /
 * `copilot:` / etc. blocks at validate time.
 */
function composeSchema(kind: string, knownTargets: Target[] | undefined) {
  // Zod's recursive generics exceed TS's instantiation depth once schemas are extended in a
  // loop over a heterogeneous target list — same tradeoff src/schema/emit.ts already makes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let schema: any = getSchema(kind); // throws on unknown kind — caller catches this
  for (const target of knownTargets ?? []) {
    const extension = target.frontmatterExtensions?.[kind as ArtifactKind];
    if (!extension) continue;
    schema = schema.extend({
      [target.name]: z.object(extension as z.ZodRawShape).optional(),
    });
  }
  return schema;
}

/** Renders one RefCheck in validate's established per-field wording. */
function formatRefError(check: RefCheck): string {
  const prefix =
    check.problem === 'dangling' ? `Dangling ${check.field} reference` : `Invalid ${check.field}`;
  return `${prefix}: '${check.ref}' ${describeRefProblem(check)}`;
}

/** Pushes one schema-parse error per issue found. */
function pushSchemaIssues(
  ctx: ValidateCtx,
  artifact: Artifact,
  result: ReturnType<ReturnType<typeof getSchema>['safeParse']>,
): void {
  if (result.success) return;
  for (const issue of result.error.issues) {
    const fieldPath = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    ctx.errors.push({
      artifactId: artifact.id,
      filePath: artifact.filePath,
      error: `Schema: ${fieldPath} — ${issue.message}`,
    });
  }
}

/** §1: zod schema validation for one artifact; returns false when the kind itself is unknown. */
export function checkSchema(ctx: ValidateCtx, artifact: Artifact): boolean {
  let schema;
  try {
    schema = composeSchema(artifact.kind, ctx.knownTargets);
  } catch {
    ctx.errors.push({
      artifactId: artifact.id,
      filePath: artifact.filePath,
      error: `Unknown kind '${artifact.kind}'`,
    });
    return false;
  }

  pushSchemaIssues(ctx, artifact, schema.safeParse(artifact.frontmatter));
  return true;
}

/** §2: extends / uses.rules / uses.agents + workflow step references. */
export function checkReferenceIntegrity(ctx: ValidateCtx, artifact: Artifact): void {
  for (const check of checkReferences(artifact.frontmatter, ctx.catalog)) {
    ctx.errors.push({
      artifactId: artifact.id,
      filePath: artifact.filePath,
      error: formatRefError(check),
    });
  }

  const steps = artifact.frontmatter.steps as Array<{ ref: string }> | undefined;
  for (const step of steps ?? []) {
    if (!ctx.catalog.byId.has(step.ref)) {
      ctx.errors.push({
        artifactId: artifact.id,
        filePath: artifact.filePath,
        error: `Dangling workflow step reference: '${step.ref}' does not exist in the catalog`,
      });
    }
  }
}
