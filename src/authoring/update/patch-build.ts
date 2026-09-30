/**
 * buildFieldPatch — validates UpdateOps and produces a frontmatter patch object.
 *
 * Each field group is handled by a focused private helper that appends to the
 * shared `patch` and `errors` arrays, returning whether the field changed.
 */
import type { Artifact } from '../../types';

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

// ─── List helper ──────────────────────────────────────────────────────────────

function patchList(
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

// ─── Per-field-group handlers ─────────────────────────────────────────────────

function applyTitle(
  fm: Record<string, unknown>,
  ops: UpdateOps,
  patch: Record<string, unknown>,
  errors: string[],
): boolean {
  if (ops.title === undefined) return false;
  if (!ops.title.trim()) {
    errors.push("'title' is required — cannot clear it");
    return false;
  }
  if (ops.title === fm.title) return false;
  patch.title = ops.title;
  return true;
}

function applyDescription(
  fm: Record<string, unknown>,
  ops: UpdateOps,
  patch: Record<string, unknown>,
  errors: string[],
): boolean {
  if (ops.description === undefined) return false;
  if (!ops.description.trim()) {
    errors.push("'description' is required — cannot clear it");
    return false;
  }
  if (ops.description === fm.description) return false;
  patch.description = ops.description;
  return true;
}

function applyVersion(
  fm: Record<string, unknown>,
  ops: UpdateOps,
  patch: Record<string, unknown>,
): boolean {
  if (ops.version === undefined || ops.version === fm.version) return false;
  patch.version = ops.version || undefined;
  return true;
}

function applyTags(
  fm: Record<string, unknown>,
  ops: UpdateOps,
  patch: Record<string, unknown>,
): boolean {
  if (ops.setTags === undefined && ops.addTags === undefined && ops.removeTags === undefined)
    return false;
  const current = (fm.tags as string[] | undefined) ?? [];
  const updated = patchList(current, { set: ops.setTags, add: ops.addTags, remove: ops.removeTags });
  if (JSON.stringify(updated) === JSON.stringify(current)) return false;
  patch.tags = updated;
  return true;
}

function applyAppliesTo(
  fm: Record<string, unknown>,
  kind: string,
  ops: UpdateOps,
  patch: Record<string, unknown>,
  errors: string[],
): boolean {
  if (
    ops.setAppliesTo === undefined &&
    ops.addAppliesTo === undefined &&
    ops.removeAppliesTo === undefined
  )
    return false;
  if (!['skill', 'rule', 'prompt'].includes(kind)) {
    errors.push(`'appliesTo' is not applicable to '${kind}' artifacts`);
    return false;
  }
  const current = (fm.appliesTo as string[] | undefined) ?? ['**/*'];
  const updated = patchList(current, {
    set: ops.setAppliesTo,
    add: ops.addAppliesTo,
    remove: ops.removeAppliesTo,
  });
  const normalized = updated.length === 0 ? ['**/*'] : updated;
  if (JSON.stringify(normalized) === JSON.stringify(current)) return false;
  patch.appliesTo = normalized;
  return true;
}

function applySeverity(
  fm: Record<string, unknown>,
  kind: string,
  ops: UpdateOps,
  patch: Record<string, unknown>,
  errors: string[],
): boolean {
  if (ops.severity === undefined) return false;
  if (kind !== 'rule') {
    errors.push(`'severity' is only applicable to rule artifacts, not '${kind}'`);
    return false;
  }
  const valid = ['required', 'recommended', 'optional'];
  if (!valid.includes(ops.severity)) {
    errors.push(`Invalid severity '${ops.severity}'. Must be one of: ${valid.join(', ')}`);
    return false;
  }
  if (ops.severity === fm.severity) return false;
  patch.severity = ops.severity;
  return true;
}

function applyExtends(
  fm: Record<string, unknown>,
  kind: string,
  ops: UpdateOps,
  patch: Record<string, unknown>,
  errors: string[],
): boolean {
  if (
    ops.setExtends === undefined &&
    ops.addExtends === undefined &&
    ops.removeExtends === undefined
  )
    return false;
  if (kind !== 'rule') {
    errors.push(`'extends' is only applicable to rule artifacts, not '${kind}'`);
    return false;
  }
  const current = (fm.extends as string[] | undefined) ?? [];
  const updated = patchList(current, {
    set: ops.setExtends,
    add: ops.addExtends,
    remove: ops.removeExtends,
  });
  if (JSON.stringify(updated) === JSON.stringify(current)) return false;
  patch.extends = updated;
  return true;
}

function applyUses(
  fm: Record<string, unknown>,
  kind: string,
  ops: UpdateOps,
  patch: Record<string, unknown>,
  errors: string[],
): boolean {
  const hasOp =
    ops.setUsesRules !== undefined ||
    ops.addUsesRules !== undefined ||
    ops.removeUsesRules !== undefined ||
    ops.setUsesAgents !== undefined ||
    ops.addUsesAgents !== undefined ||
    ops.removeUsesAgents !== undefined;
  if (!hasOp) return false;
  if (kind !== 'skill') {
    errors.push(`'uses' fields are only applicable to skill artifacts, not '${kind}'`);
    return false;
  }
  const currentUses = (fm.uses as { rules?: string[]; agents?: string[] } | undefined) ?? {};
  const currentRules = currentUses.rules ?? [];
  const currentAgents = currentUses.agents ?? [];
  const updatedRules =
    ops.setUsesRules !== undefined || ops.addUsesRules !== undefined || ops.removeUsesRules !== undefined
      ? patchList(currentRules, { set: ops.setUsesRules, add: ops.addUsesRules, remove: ops.removeUsesRules })
      : currentRules;
  const updatedAgents =
    ops.setUsesAgents !== undefined || ops.addUsesAgents !== undefined || ops.removeUsesAgents !== undefined
      ? patchList(currentAgents, { set: ops.setUsesAgents, add: ops.addUsesAgents, remove: ops.removeUsesAgents })
      : currentAgents;
  if (
    JSON.stringify(updatedRules) === JSON.stringify(currentRules) &&
    JSON.stringify(updatedAgents) === JSON.stringify(currentAgents)
  )
    return false;
  patch.uses = { rules: updatedRules, agents: updatedAgents };
  return true;
}

function applyTools(
  fm: Record<string, unknown>,
  kind: string,
  ops: UpdateOps,
  patch: Record<string, unknown>,
  errors: string[],
): boolean {
  if (ops.setTools === undefined && ops.addTools === undefined && ops.removeTools === undefined)
    return false;
  if (kind !== 'agent') {
    errors.push(`'tools' is only applicable to agent artifacts, not '${kind}'`);
    return false;
  }
  const current = (fm.tools as string[] | undefined) ?? [];
  const updated = patchList(current, { set: ops.setTools, add: ops.addTools, remove: ops.removeTools });
  if (JSON.stringify(updated) === JSON.stringify(current)) return false;
  patch.tools = updated.length ? updated : undefined;
  return true;
}

function applyDisallowedTools(
  fm: Record<string, unknown>,
  kind: string,
  ops: UpdateOps,
  patch: Record<string, unknown>,
  errors: string[],
): boolean {
  if (
    ops.setDisallowedTools === undefined &&
    ops.addDisallowedTools === undefined &&
    ops.removeDisallowedTools === undefined
  )
    return false;
  if (kind !== 'agent') {
    errors.push(`'disallowedTools' is only applicable to agent artifacts, not '${kind}'`);
    return false;
  }
  const current = (fm.disallowedTools as string[] | undefined) ?? [];
  const updated = patchList(current, {
    set: ops.setDisallowedTools,
    add: ops.addDisallowedTools,
    remove: ops.removeDisallowedTools,
  });
  if (JSON.stringify(updated) === JSON.stringify(current)) return false;
  patch.disallowedTools = updated.length ? updated : undefined;
  return true;
}

function applyClaude(
  fm: Record<string, unknown>,
  kind: string,
  ops: UpdateOps,
  patch: Record<string, unknown>,
  errors: string[],
): boolean {
  const hasOp =
    ops.claudeModel !== undefined ||
    ops.claudeEffort !== undefined ||
    ops.claudeMaxTurns !== undefined ||
    ops.claudeIsolation !== undefined;
  if (!hasOp) return false;
  if (kind !== 'agent') {
    errors.push(`'claude.*' fields are only applicable to agent artifacts, not '${kind}'`);
    return false;
  }
  const current = (fm.claude as Record<string, unknown> | undefined) ?? {};
  const updated = { ...current };
  const errsBefore = errors.length;

  if (ops.claudeModel !== undefined) {
    const valid = ['haiku', 'sonnet', 'opus'];
    if (!valid.includes(ops.claudeModel)) {
      errors.push(`Invalid claude.model '${ops.claudeModel}'. Must be one of: ${valid.join(', ')}`);
    } else {
      updated.model = ops.claudeModel;
    }
  }
  if (ops.claudeEffort !== undefined) {
    const valid = ['low', 'medium', 'high'];
    if (!valid.includes(ops.claudeEffort)) {
      errors.push(`Invalid claude.effort '${ops.claudeEffort}'. Must be one of: ${valid.join(', ')}`);
    } else {
      updated.effort = ops.claudeEffort;
    }
  }
  if (ops.claudeMaxTurns !== undefined) {
    if (!Number.isInteger(ops.claudeMaxTurns) || ops.claudeMaxTurns < 1) {
      errors.push('claude.maxTurns must be a positive integer');
    } else {
      updated.maxTurns = ops.claudeMaxTurns;
    }
  }
  if (ops.claudeIsolation !== undefined) {
    const valid = ['worktree'];
    if (!valid.includes(ops.claudeIsolation)) {
      errors.push(`Invalid claude.isolation '${ops.claudeIsolation}'. Must be one of: ${valid.join(', ')}`);
    } else {
      updated.isolation = ops.claudeIsolation;
    }
  }

  if (errors.length > errsBefore) return false;
  if (JSON.stringify(updated) === JSON.stringify(current)) return false;
  patch.claude = Object.keys(updated).length ? updated : undefined;
  return true;
}

// ─── Main build function ──────────────────────────────────────────────────────

/**
 * Build a frontmatter patch from the given UpdateOps.
 *
 * Only specified ops produce patch entries; unspecified fields pass through unchanged.
 * Each field group is validated and applied by its own helper above.
 */
export function buildFieldPatch(artifact: Artifact, ops: UpdateOps): PatchResult {
  const errors: string[] = [];
  const patch: Record<string, unknown> = {};
  const fm = artifact.frontmatter;
  const kind = artifact.kind;

  const changed = [
    applyTitle(fm, ops, patch, errors),
    applyDescription(fm, ops, patch, errors),
    applyVersion(fm, ops, patch),
    applyTags(fm, ops, patch),
    applyAppliesTo(fm, kind, ops, patch, errors),
    applySeverity(fm, kind, ops, patch, errors),
    applyExtends(fm, kind, ops, patch, errors),
    applyUses(fm, kind, ops, patch, errors),
    applyTools(fm, kind, ops, patch, errors),
    applyDisallowedTools(fm, kind, ops, patch, errors),
    applyClaude(fm, kind, ops, patch, errors),
  ].some(Boolean);

  return { patch, noOp: !changed || errors.length > 0, errors };
}
