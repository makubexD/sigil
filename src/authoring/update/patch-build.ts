/**
 * buildFieldPatch — validates UpdateOps and produces a frontmatter patch object.
 *
 * Each field group is handled by a focused helper that appends to the shared
 * `patch` and `errors` arrays, returning whether the field changed. Handlers are
 * split across three sibling modules by field family — this file keeps only the
 * shared types, the `patchList` primitive, and the `buildFieldPatch` orchestrator:
 *   patch-fields-basic.ts — title, description, tags, appliesTo, severity
 *   patch-fields-refs.ts  — extends, uses.rules, uses.agents
 *   patch-fields-agent.ts — tools, disallowedTools, claude.*
 *
 * Shared types (`UpdateOps`, `PatchCtx`) and the `patchList` primitive live in patch-types.ts,
 * not here — keeping them in this file was a circular import (see that file's header).
 */
import type { Artifact } from '../../types';
import type { UpdateOps, PatchCtx } from './patch-types';
import {
  applyTitle,
  applyDescription,
  applyTags,
  applyAppliesTo,
  applyAppliesToRationale,
  applySeverity,
} from './patch-fields-basic';
import { applyExtends, applyUses } from './patch-fields-refs';
import { applyTools, applyDisallowedTools, applyClaude } from './patch-fields-agent';

export type { UpdateOps } from './patch-types';

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface PatchResult {
  /** Frontmatter patch to pass to writeArtifactFrontmatter. */
  patch: Record<string, unknown>;
  /** True when no field was actually changed (all ops were no-ops). */
  noOp: boolean;
  /** Validation errors that must block the write. */
  errors: string[];
}

// ─── Main build function ──────────────────────────────────────────────────────

/** Every field-group handler, applied in this order to build the patch. */
const FIELD_HANDLERS: Array<(ctx: PatchCtx, ops: UpdateOps) => boolean> = [
  applyTitle,
  applyDescription,
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
