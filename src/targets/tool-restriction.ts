/**
 * An agent's tool restriction (`tools`, `disallowedTools`) must reach the file a target writes:
 * every provider gives an agent with no restriction every tool, so a restriction a spec cannot carry
 * would silently widen the agent. `restrictionOutcome` classifies that per spec: `exact` when the
 * restriction is carried as written, `skip` when it cannot be (the default, fail-closed), and
 * `nearest` when the agent opts into the closest mapping with `toolPolicy: nearest`, which warns.
 * renderArtifact refuses to render a `skip` (build, add and update all fail closed), and
 * `sync --check`'s tool-restriction-coverage rule reports the gap earlier.
 *
 * A mapped restriction on a spec with no `toolDialect` counts as exact (the transition until every
 * agent spec has one). See docs/decisions/neutral-agent-vocabulary-2026-11.md.
 *
 * @module
 */
import type { KindEmitSpec } from './spec-types';
import { renderTools } from './tool-dialect';

/** Agent fields that narrow which tools the agent gets. */
export const TOOL_RESTRICTION_FIELDS = ['tools', 'disallowedTools'] as const;

/** How `spec` can carry `frontmatter`'s tool restrictions. */
export type RestrictionOutcome =
  | { kind: 'exact' }
  | { kind: 'nearest'; warning: string }
  | { kind: 'skip'; reason: string };

/** The problem with a mapped field `spec`'s dialect cannot carry exactly, or `[]`. */
function inexactToolProblem(
  spec: KindEmitSpec,
  field: string,
  value: readonly unknown[],
): string[] {
  // No dialect yet means the mapping carries the names as written (the transition).
  if (!spec.toolDialect) return [];
  const authored = value.filter((entry): entry is string => typeof entry === 'string');
  const rendered = renderTools(spec.toolDialect, authored);
  return rendered.exact ? [] : [`${field} tool(s) ${rendered.missing.join(', ')}`];
}

/** Every restriction `frontmatter` declares that `spec` cannot carry, as readable problems. */
function restrictionProblems(spec: KindEmitSpec, frontmatter: Record<string, unknown>): string[] {
  const carried = new Set(spec.frontmatter.map(mapping => mapping.from));
  return TOOL_RESTRICTION_FIELDS.flatMap(field => {
    const value = frontmatter[field];
    if (!Array.isArray(value)) return [];
    if (!carried.has(field)) return [`${field} (the agent would get every tool)`];
    return inexactToolProblem(spec, field, value);
  });
}

/**
 * Classifies whether `spec` can carry the restrictions `frontmatter` declares. Non-agent specs
 * carry no such field, so they are always `exact`.
 */
export function restrictionOutcome(
  spec: KindEmitSpec,
  frontmatter: Record<string, unknown>,
): RestrictionOutcome {
  if (spec.kind !== 'agent') return { kind: 'exact' };
  const problems = restrictionProblems(spec, frontmatter);
  if (problems.length === 0) return { kind: 'exact' };
  const parts = problems.join('; ');
  if (frontmatter.toolPolicy === 'nearest') {
    return {
      kind: 'nearest',
      warning: `this tool cannot express ${parts} exactly; the nearest mapping is written`,
    };
  }
  return { kind: 'skip', reason: `this tool cannot express ${parts}` };
}

/** The reason `add`/`status` skip `artifact` for `spec`, or `undefined` when it renders. */
export function toolSkipReason(
  spec: KindEmitSpec,
  artifact: { frontmatter: Record<string, unknown> },
): string | undefined {
  const outcome = restrictionOutcome(spec, artifact.frontmatter);
  return outcome.kind === 'skip' ? outcome.reason : undefined;
}
