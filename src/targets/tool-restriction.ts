/**
 * An agent's tool restriction (`tools`, `disallowedTools`) must reach the file a target writes:
 * every provider gives an agent with no restriction every tool, so a restriction a spec cannot carry
 * would silently widen the agent. renderArtifact refuses to render such an agent (build, add and
 * update all fail closed), and `sync --check`'s tool-restriction-coverage rule reports it earlier.
 *
 * @module
 */
import type { KindEmitSpec } from './spec-types';
import { SigilError } from '../errors';

/** Agent fields that narrow which tools the agent gets. */
export const TOOL_RESTRICTION_FIELDS = ['tools', 'disallowedTools'] as const;

/** The restriction fields `frontmatter` declares that `spec` has no mapping for. */
export function droppedRestrictions(
  spec: KindEmitSpec,
  frontmatter: Record<string, unknown>,
): string[] {
  if (spec.kind !== 'agent') return [];
  const carried = new Set(spec.frontmatter.map(mapping => mapping.from));
  return TOOL_RESTRICTION_FIELDS.filter(f => frontmatter[f] !== undefined && !carried.has(f));
}

/** Throws when `artifact` declares a restriction `spec` would drop, instead of rendering it. */
export function assertRestrictionsCarried(
  spec: KindEmitSpec,
  artifact: { id: string; frontmatter: Record<string, unknown> },
): void {
  const dropped = droppedRestrictions(spec, artifact.frontmatter);
  if (dropped.length === 0) return;
  throw new SigilError(
    `${artifact.id}: this tool cannot express ${dropped.join(', ')}, so the agent would get every tool`,
    { hint: 'Exclude this tool with platforms:, or use a tools allowlist instead.' },
  );
}
