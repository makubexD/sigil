/**
 * An agent's tool restriction (`tools`, `disallowedTools`) must reach the file a target writes:
 * every provider gives an agent with no restriction every tool, so a restriction a spec cannot carry
 * would silently widen the agent. `restrictionOutcome` classifies that per spec: `exact` when the
 * restriction is carried as written, `skip` when it cannot be (the default, fail-closed), and
 * `nearest` when the agent opts into the closest mapping with `toolPolicy: nearest`, which warns;
 * on a `read-only-flag` target the warning also names the direction, since the absent flag either
 * narrows the agent to read-only or leaves it every tool.
 * `add` and the wizard skip a `skip` agent at selection time (`wholeFileSkipReason`), emitFile
 * leaves it out of a build, and renderArtifact refuses to render one as a backstop.
 * `sync --check`'s tool-restriction-coverage rule reports the gap earlier.
 *
 * A mapped restriction on a spec with no `toolDialect` is inexact too: the catalog's names could
 * only be copied into the output untranslated, which is not the provider's vocabulary. It is
 * treated as not carried, so the agent is skipped (or mapped nearest) rather than widened.
 * See docs/decisions/neutral-agent-vocabulary-2026-11.md.
 *
 * @module
 */
import type { ArtifactKind, Target } from '../types';
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
  // Without a dialect the mapping could only copy the names untranslated: inexact, fail closed.
  if (!spec.toolDialect) {
    return [`${field} (the target has no tool dialect to translate its names)`];
  }
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
 * What the nearest mapping meant on a `read-only-flag` target, as a warning suffix: the agent
 * ends up read-only (losing the tools the flag cannot express) or keeps every tool this target
 * has. Empty for any other spec, so `nearest` keeps its current wording everywhere else.
 */
function nearestDirection(spec: KindEmitSpec, frontmatter: Record<string, unknown>): string {
  const dialect = spec.toolDialect;
  const value = frontmatter.tools;
  if (dialect?.kind !== 'read-only-flag' || !Array.isArray(value)) return '';
  const authored = value.filter((entry): entry is string => typeof entry === 'string');
  const rendered = renderTools(dialect, authored);
  if (rendered.kind !== 'read-only-flag') return '';
  return rendered.readOnly
    ? ' (read-only, so the agent loses those tools)'
    : ' (no read-only flag, so the agent gets every tool this target has)';
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
      warning: `this tool cannot express ${parts} exactly; the nearest mapping is written${nearestDirection(spec, frontmatter)}`,
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

/** The warning a `nearest` outcome reports, or `undefined` when the outcome is not `nearest`. */
export function toolWarning(
  spec: KindEmitSpec,
  artifact: { frontmatter: Record<string, unknown> },
): string | undefined {
  const outcome = restrictionOutcome(spec, artifact.frontmatter);
  return outcome.kind === 'nearest' ? outcome.warning : undefined;
}

/**
 * The reason `add` and the wizard skip `artifact` as a whole file for `target`, or `undefined`
 * when it renders. The scaffold-spec lookup is `specFor` (./emit-files.ts) inlined: importing it
 * would close the cycle emit-files → emit → this module.
 */
export function wholeFileSkipReason(
  target: Pick<Target, 'emitSpecs'>,
  artifact: { kind: ArtifactKind; frontmatter: Record<string, unknown> },
): string | undefined {
  const spec = (target.emitSpecs ?? []).find(
    candidate =>
      candidate.kind === artifact.kind &&
      (candidate.variant === undefined || candidate.variant === 'scaffold'),
  );
  return spec ? toolSkipReason(spec, artifact) : undefined;
}
