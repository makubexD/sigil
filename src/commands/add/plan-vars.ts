/**
 * `sigil add` — the install values this plan carries: the `mcp` artifacts among the config ids,
 * the value resolved for each declared name, and the partition the plan is assembled from. Kept
 * out of plan.ts to leave that module under the repo's own module-size threshold.
 *
 * @module
 */
import { loadManifest, recordedVars } from '../../manifest';
import { isInteractiveTTY } from '../../wizard';
import type { VarValues } from '../../mcp-vars';
import type { ResolvedArtifact } from '../../types';
import { askVar, resolveAddVars } from './resolve-vars';
import type { PartitionedIds, PlanCtx } from './plan-context';

/** The partition plus the install values every config op in this plan must use. */
export interface PlannedPartition extends PartitionedIds {
  vars: VarValues;
}

/** The `mcp` artifacts among `ids`, in order: the only config kind with install variables. */
function mcpArtifacts(ctx: PlanCtx, ids: readonly string[]): ResolvedArtifact[] {
  return ids.flatMap(id => {
    const artifact = ctx.resolved.byId.get(id);
    return artifact?.kind === 'mcp' ? [artifact] : [];
  });
}

/**
 * The value for every variable this plan's `mcp` artifacts declare, or null when the user
 * cancelled a prompt. An up-to-date artifact accepts flags for its names but resolves nothing.
 */
export async function resolvePlanVars(
  ctx: PlanCtx,
  partition: PartitionedIds,
): Promise<PlannedPartition | null> {
  const vars = await resolveAddVars({
    artifacts: mcpArtifacts(ctx, partition.configIds),
    upToDate: mcpArtifacts(ctx, partition.upToDateIds),
    flags: ctx.varFlags,
    recorded: id => recordedVars(loadManifest(ctx.opts.projectDir), id, ctx.target.name),
    dryRun: ctx.opts.dryRun,
    yes: ctx.opts.yes,
    interactive: isInteractiveTTY(),
    ask: askVar,
  });
  return vars === 'cancelled' ? null : { ...partition, vars };
}
