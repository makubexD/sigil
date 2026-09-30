/**
 * `sigil patch` field handlers for agent-only fields: `tools`, `disallowedTools`,
 * and the `claude.*` namespace (model / effort / maxTurns / isolation).
 *
 * Split out of patch-build.ts by field family — see that file for the shared
 * `PatchCtx` / `patchList` plumbing and the `buildFieldPatch` orchestrator.
 *
 * @module
 */
import type { UpdateOps, PatchCtx } from './patch-types';
import { patchList } from './patch-types';

/** Shared shape for an agent-only list field's set/add/remove ops. */
interface AgentListFieldOps {
  readonly field: 'tools' | 'disallowedTools';
  readonly set: string[] | undefined;
  readonly add: string[] | undefined;
  readonly remove: string[] | undefined;
}

/** Applies a `tools`-shaped list field (agent-kind-gated), used by both applyTools variants. */
function applyAgentListField(ctx: PatchCtx, fieldOps: AgentListFieldOps): boolean {
  const { field, set, add, remove } = fieldOps;
  if (set === undefined && add === undefined && remove === undefined) return false;
  if (ctx.kind !== 'agent') {
    ctx.errors.push(`'${field}' is only applicable to agent artifacts, not '${ctx.kind}'`);
    return false;
  }
  const current = (ctx.fm[field] as string[] | undefined) ?? [];
  const updated = patchList(current, { set, add, remove });
  if (JSON.stringify(updated) === JSON.stringify(current)) return false;
  ctx.patch[field] = updated.length ? updated : undefined;
  return true;
}

export function applyTools(ctx: PatchCtx, ops: UpdateOps): boolean {
  return applyAgentListField(ctx, {
    field: 'tools',
    set: ops.setTools,
    add: ops.addTools,
    remove: ops.removeTools,
  });
}

export function applyDisallowedTools(ctx: PatchCtx, ops: UpdateOps): boolean {
  return applyAgentListField(ctx, {
    field: 'disallowedTools',
    set: ops.setDisallowedTools,
    add: ops.addDisallowedTools,
    remove: ops.removeDisallowedTools,
  });
}

/** Validates + applies `claude.model`, pushing an error to `errors` when invalid. */
function applyClaudeModel(updated: Record<string, unknown>, value: string, errors: string[]): void {
  const valid = ['haiku', 'sonnet', 'opus'];
  if (!valid.includes(value)) {
    errors.push(`Invalid claude.model '${value}'. Must be one of: ${valid.join(', ')}`);
  } else {
    updated.model = value;
  }
}

function applyClaudeEffort(
  updated: Record<string, unknown>,
  value: string,
  errors: string[],
): void {
  const valid = ['low', 'medium', 'high'];
  if (!valid.includes(value)) {
    errors.push(`Invalid claude.effort '${value}'. Must be one of: ${valid.join(', ')}`);
  } else {
    updated.effort = value;
  }
}

function applyClaudeMaxTurns(
  updated: Record<string, unknown>,
  value: number,
  errors: string[],
): void {
  if (!Number.isInteger(value) || value < 1) {
    errors.push('claude.maxTurns must be a positive integer');
  } else {
    updated.maxTurns = value;
  }
}

function applyClaudeIsolation(
  updated: Record<string, unknown>,
  value: string,
  errors: string[],
): void {
  const valid = ['worktree'];
  if (!valid.includes(value)) {
    errors.push(`Invalid claude.isolation '${value}'. Must be one of: ${valid.join(', ')}`);
  } else {
    updated.isolation = value;
  }
}

function claudeHasOp(ops: UpdateOps): boolean {
  return (
    ops.claudeModel !== undefined ||
    ops.claudeEffort !== undefined ||
    ops.claudeMaxTurns !== undefined ||
    ops.claudeIsolation !== undefined
  );
}

/** Applies whichever `claude.*` fields were provided, collecting per-field errors. */
function applyClaudeFields(
  updated: Record<string, unknown>,
  ops: UpdateOps,
  errors: string[],
): void {
  if (ops.claudeModel !== undefined) applyClaudeModel(updated, ops.claudeModel, errors);
  if (ops.claudeEffort !== undefined) applyClaudeEffort(updated, ops.claudeEffort, errors);
  if (ops.claudeMaxTurns !== undefined) applyClaudeMaxTurns(updated, ops.claudeMaxTurns, errors);
  if (ops.claudeIsolation !== undefined) applyClaudeIsolation(updated, ops.claudeIsolation, errors);
}

export function applyClaude(ctx: PatchCtx, ops: UpdateOps): boolean {
  if (!claudeHasOp(ops)) return false;
  if (ctx.kind !== 'agent') {
    ctx.errors.push(`'claude.*' fields are only applicable to agent artifacts, not '${ctx.kind}'`);
    return false;
  }
  const current = (ctx.fm.claude as Record<string, unknown> | undefined) ?? {};
  const updated = { ...current };
  const fieldErrors: string[] = [];
  applyClaudeFields(updated, ops, fieldErrors);

  if (fieldErrors.length > 0) {
    ctx.errors.push(...fieldErrors);
    return false;
  }
  if (JSON.stringify(updated) === JSON.stringify(current)) return false;
  ctx.patch.claude = Object.keys(updated).length ? updated : undefined;
  return true;
}
