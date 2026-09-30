/**
 * `sigil patch` field handlers for the reference-graph fields: `extends` (rule
 * inheritance) and `uses.rules` / `uses.agents` (skill dependency closure).
 *
 * Split out of patch-build.ts by field family — see that file for the shared
 * `PatchCtx` / `patchList` plumbing and the `buildFieldPatch` orchestrator.
 *
 * @module
 */
import type { UpdateOps, PatchCtx } from './patch-build';
import { patchList } from './patch-build';

function extendsHasOp(ops: UpdateOps): boolean {
  return (
    ops.setExtends !== undefined || ops.addExtends !== undefined || ops.removeExtends !== undefined
  );
}

export function applyExtends(ctx: PatchCtx, ops: UpdateOps): boolean {
  if (!extendsHasOp(ops)) return false;
  if (ctx.kind !== 'rule') {
    ctx.errors.push(`'extends' is only applicable to rule artifacts, not '${ctx.kind}'`);
    return false;
  }
  const current = (ctx.fm.extends as string[] | undefined) ?? [];
  const updated = patchList(current, {
    set: ops.setExtends,
    add: ops.addExtends,
    remove: ops.removeExtends,
  });
  if (JSON.stringify(updated) === JSON.stringify(current)) return false;
  ctx.patch.extends = updated;
  return true;
}

function usesHasOp(ops: UpdateOps): boolean {
  return (
    ops.setUsesRules !== undefined ||
    ops.addUsesRules !== undefined ||
    ops.removeUsesRules !== undefined ||
    ops.setUsesAgents !== undefined ||
    ops.addUsesAgents !== undefined ||
    ops.removeUsesAgents !== undefined
  );
}

/** Applies set/add/remove ops to one `uses.*` list, or returns it unchanged if no op given. */
function applyUsesList(
  current: string[],
  set: string[] | undefined,
  add: string[] | undefined,
  remove: string[] | undefined,
): string[] {
  if (set === undefined && add === undefined && remove === undefined) return current;
  return patchList(current, { set, add, remove });
}

interface UsesLists {
  readonly rules: string[];
  readonly agents: string[];
}

/** Computes the updated `uses.rules`/`uses.agents` lists from the current frontmatter + ops. */
function computeUpdatedUses(ctx: PatchCtx, ops: UpdateOps): UsesLists {
  const currentUses = (ctx.fm.uses as { rules?: string[]; agents?: string[] } | undefined) ?? {};
  return {
    rules: applyUsesList(
      currentUses.rules ?? [],
      ops.setUsesRules,
      ops.addUsesRules,
      ops.removeUsesRules,
    ),
    agents: applyUsesList(
      currentUses.agents ?? [],
      ops.setUsesAgents,
      ops.addUsesAgents,
      ops.removeUsesAgents,
    ),
  };
}

export function applyUses(ctx: PatchCtx, ops: UpdateOps): boolean {
  if (!usesHasOp(ops)) return false;
  if (ctx.kind !== 'skill') {
    ctx.errors.push(`'uses' fields are only applicable to skill artifacts, not '${ctx.kind}'`);
    return false;
  }
  const currentUses = (ctx.fm.uses as { rules?: string[]; agents?: string[] } | undefined) ?? {};
  const updated = computeUpdatedUses(ctx, ops);
  if (
    JSON.stringify(updated.rules) === JSON.stringify(currentUses.rules ?? []) &&
    JSON.stringify(updated.agents) === JSON.stringify(currentUses.agents ?? [])
  )
    return false;
  ctx.patch.uses = updated;
  return true;
}
