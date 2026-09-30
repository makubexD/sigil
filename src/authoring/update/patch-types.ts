/**
 * Shared types and the `patchList` primitive for the `sigil patch` field-group handlers.
 *
 * Split out of patch-build.ts to break a value-level circular import: patch-build.ts imports
 * the per-field-group handler functions from patch-fields-basic.ts/patch-fields-refs.ts/
 * patch-fields-agent.ts, and each of those imported `UpdateOps`/`PatchCtx`/`patchList` back from
 * patch-build.ts — a real A→B→A cycle, fragile under CommonJS load order (2026-08-22 audit F28).
 * This is the one-directional leaf every field-group module (including patch-build.ts itself)
 * imports from; nothing in here imports from patch-build.ts or any patch-fields-*.ts.
 */

/**
 * All possible field mutations the `sigil patch` command accepts.
 * Only the fields provided are applied; all others remain unchanged.
 */
export interface UpdateOps {
  title?: string | undefined;
  description?: string | undefined;

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
