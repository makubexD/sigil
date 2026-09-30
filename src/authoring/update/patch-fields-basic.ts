/**
 * `sigil patch` field handlers for the simple scalar/list fields shared by every
 * artifact kind: title, description, version, tags, appliesTo, severity.
 *
 * Split out of patch-build.ts by field family — see that file for the shared
 * `PatchCtx` / `patchList` plumbing and the `buildFieldPatch` orchestrator.
 *
 * @module
 */
import type { UpdateOps, PatchCtx } from './patch-build';
import { patchList } from './patch-build';

export function applyTitle(ctx: PatchCtx, ops: UpdateOps): boolean {
  if (ops.title === undefined) return false;
  if (!ops.title.trim()) {
    ctx.errors.push("'title' is required — cannot clear it");
    return false;
  }
  if (ops.title === ctx.fm.title) return false;
  ctx.patch.title = ops.title;
  return true;
}

export function applyDescription(ctx: PatchCtx, ops: UpdateOps): boolean {
  if (ops.description === undefined) return false;
  if (!ops.description.trim()) {
    ctx.errors.push("'description' is required — cannot clear it");
    return false;
  }
  if (ops.description === ctx.fm.description) return false;
  ctx.patch.description = ops.description;
  return true;
}

export function applyVersion(ctx: PatchCtx, ops: UpdateOps): boolean {
  if (ops.version === undefined || ops.version === ctx.fm.version) return false;
  ctx.patch.version = ops.version || undefined;
  return true;
}

export function applyTags(ctx: PatchCtx, ops: UpdateOps): boolean {
  if (ops.setTags === undefined && ops.addTags === undefined && ops.removeTags === undefined)
    return false;
  const current = (ctx.fm.tags as string[] | undefined) ?? [];
  const updated = patchList(current, {
    set: ops.setTags,
    add: ops.addTags,
    remove: ops.removeTags,
  });
  if (JSON.stringify(updated) === JSON.stringify(current)) return false;
  ctx.patch.tags = updated;
  return true;
}

// 'skill' intentionally excluded — appliesTo was removed from SkillSchema (skills have no
// path-scoped loading; they dispatch by description/whenToUse relevance, not file path).
const APPLIES_TO_KINDS = ['rule', 'prompt'];

function hasAppliesToOp(ops: UpdateOps): boolean {
  return (
    ops.setAppliesTo !== undefined ||
    ops.addAppliesTo !== undefined ||
    ops.removeAppliesTo !== undefined
  );
}

export function applyAppliesTo(ctx: PatchCtx, ops: UpdateOps): boolean {
  if (!hasAppliesToOp(ops)) return false;
  if (!APPLIES_TO_KINDS.includes(ctx.kind)) {
    ctx.errors.push(`'appliesTo' is not applicable to '${ctx.kind}' artifacts`);
    return false;
  }
  const current = (ctx.fm.appliesTo as string[] | undefined) ?? ['**/*'];
  const updated = patchList(current, {
    set: ops.setAppliesTo,
    add: ops.addAppliesTo,
    remove: ops.removeAppliesTo,
  });
  const normalized = updated.length === 0 ? ['**/*'] : updated;
  if (JSON.stringify(normalized) === JSON.stringify(current)) return false;
  ctx.patch.appliesTo = normalized;
  return true;
}

export function applyAppliesToRationale(ctx: PatchCtx, ops: UpdateOps): boolean {
  if (ops.appliesToRationale === undefined) return false;
  if (ctx.kind !== 'rule') {
    ctx.errors.push(`'appliesToRationale' is only applicable to rule artifacts, not '${ctx.kind}'`);
    return false;
  }
  const trimmed = ops.appliesToRationale.trim();
  const next = trimmed.length > 0 ? trimmed : undefined;
  if (next === ctx.fm.appliesToRationale) return false;
  ctx.patch.appliesToRationale = next;
  return true;
}

export function applySeverity(ctx: PatchCtx, ops: UpdateOps): boolean {
  if (ops.severity === undefined) return false;
  if (ctx.kind !== 'rule') {
    ctx.errors.push(`'severity' is only applicable to rule artifacts, not '${ctx.kind}'`);
    return false;
  }
  const valid = ['required', 'recommended', 'optional'];
  if (!valid.includes(ops.severity)) {
    ctx.errors.push(`Invalid severity '${ops.severity}'. Must be one of: ${valid.join(', ')}`);
    return false;
  }
  if (ops.severity === ctx.fm.severity) return false;
  ctx.patch.severity = ops.severity;
  return true;
}
