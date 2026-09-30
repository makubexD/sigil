/**
 * buildFieldPatch — validates UpdateOps and produces a frontmatter patch object.
 *
 * Each field group is handled by a focused helper that appends to the shared
 * `patch` and `errors` arrays, returning whether the field changed. Handlers are
 * split across three sibling modules by field family — this file keeps only the
 * shared types, the `patchList` primitive, and the `buildFieldPatch` orchestrator:
 *   patch-fields-basic.ts — title, description, version, tags, appliesTo, severity
 *   patch-fields-refs.ts  — extends, uses.rules, uses.agents
 *   patch-fields-agent.ts — tools, disallowedTools, claude.*
 */
import type { Artifact } from '../../types';
import {
  applyTitle,
  applyDescription,
  applyVersion,
  applyTags,
  applyAppliesTo,
  applyAppliesToRationale,
  applySeverity,
} from './patch-fields-basic';
import { applyExtends, applyUses } from './patch-fields-refs';
import { applyTools, applyDisallowedTools, applyClaude } from './patch-fields-agent';

// ─── Public interfaces ────────────────────────────────────────────────────────

/**
 * All possible field mutations the `sigil patch` command accepts.
 * Only the fields provided are applied; all others remain unchanged.
 */
export interface UpdateOps {
  title?: string | undefined;
  description?: string | undefined;
  version?: string | undefined;

  setTags?: string[] | undefined;
  addTags?: string[] | undefined;
  removeTags?: string[] | undefined;

  setAppliesTo?: string[] | undefined;
  addAppliesTo?: string[] | undefined;
  removeAppliesTo?: string[] | undefined;

  appliesToRationale?: string | undefined;

  setUsesRules?: string[] | undefined;
  addUsesRules?: string[] | undefined;
  removeUsesRules?: string[] | undefined;

  setUsesAgents?: string[] | undefined;
  addUsesAgents?: string[] | undefined;
  removeUsesAgents?: string[] | undefined;

  severity?: string | undefined;

  setExtends?: string[] | undefined;
  addExtends?: string[] | undefined;
  removeExtends?: string[] | undefined;

  setTools?: string[] | undefined;
  addTools?: string[] | undefined;
  removeTools?: string[] | undefined;

  setDisallowedTools?: string[] | undefined;
  addDisallowedTools?: string[] | undefined;
  removeDisallowedTools?: string[] | undefined;

  claudeModel?: string | undefined;
  claudeEffort?: string | undefined;
  claudeMaxTurns?: number | undefined;
  claudeIsolation?: string | undefined;
}

export interface PatchResult {
  /** Frontmatter patch to pass to writeArtifactFrontmatter. */
  patch: Record<string, unknown>;
  /** True when no field was actually changed (all ops were no-ops). */
  noOp: boolean;
  /** Validation errors that must block the write. */
  errors: string[];
}

/**
 * Mutable context threaded through every per-field-group handler — bundles the
 * four values every handler previously took as separate positional parameters
 * (fm, kind, patch, errors) into one object, so adding a fifth thing a handler
 * needs never means adding another positional parameter.
 */
export interface PatchCtx {
  readonly fm: Record<string, unknown>;
  readonly kind: string;
  readonly patch: Record<string, unknown>;
  readonly errors: string[];
}

// ─── List helper ──────────────────────────────────────────────────────────────

export function patchList(
  current: string[],
  op: { set?: string[] | undefined; add?: string[] | undefined; remove?: string[] | undefined },
): string[] {
  if (op.set !== undefined) {
    return [...new Set(op.set)];
  }
  let result = [...current];
  if (op.add) {
    for (const item of op.add) {
      if (!result.includes(item)) result.push(item);
    }
  }
  if (op.remove) {
    result = result.filter(x => !op.remove!.includes(x));
  }
  return result;
}

// ─── Main build function ──────────────────────────────────────────────────────

/** Every field-group handler, applied in this order to build the patch. */
const FIELD_HANDLERS: Array<(ctx: PatchCtx, ops: UpdateOps) => boolean> = [
  applyTitle,
  applyDescription,
  applyVersion,
  applyTags,
  applyAppliesTo,
  applyAppliesToRationale,
  applySeverity,
  applyExtends,
  applyUses,
  applyTools,
  applyDisallowedTools,
  applyClaude,
];

/**
 * Build a frontmatter patch from the given UpdateOps.
 *
 * Only specified ops produce patch entries; unspecified fields pass through unchanged.
 * Each field group is validated and applied by its own handler (see the three
 * sibling modules listed at the top of this file).
 */
export function buildFieldPatch(artifact: Artifact, ops: UpdateOps): PatchResult {
  const ctx: PatchCtx = {
    fm: artifact.frontmatter,
    kind: artifact.kind,
    patch: {},
    errors: [],
  };

  const changed = FIELD_HANDLERS.map(handler => handler(ctx, ops)).some(Boolean);

  return { patch: ctx.patch, noOp: !changed || ctx.errors.length > 0, errors: ctx.errors };
}
