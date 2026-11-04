/**
 * `sigil add` — the install values this plan carries: the `mcp` artifacts among the config ids,
 * the value resolved for each declared name, and the partition the plan is assembled from. Kept
 * out of plan.ts to leave that module under the repo's own module-size threshold.
 *
 * @module
 */
import { loadManifest, recordedVars } from '../../manifest';
import { missingVars } from '../../mcp-vars';
import type { VarValues } from '../../mcp-vars';
import type { SkippedArtifact } from '../../select';
import type { ResolvedArtifact } from '../../types';
import { isInteractiveTTY, printSkippedAdvice } from '../../wizard';
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

/** Whether a selector names `artifact` itself, as opposed to `all`, `kind:` or `pack:`. */
function namedDirectly(ctx: PlanCtx, artifact: ResolvedArtifact): boolean {
  const { id, kind } = artifact;
  return ctx.inputs.selectors.some(selector => selector === id || selector === `${kind}:${id}`);
}

/**
 * Picks a bulk selector swept in that this run has no value for and can't ask about. `add all
 * --yes` shouldn't fail because of a server nobody chose, and whoever doesn't use it has no value
 * to pass. A server named directly isn't here: it fails with the `--var` hint instead.
 */
function unaskedPicks(ctx: PlanCtx, partition: PartitionedIds): SkippedArtifact[] {
  if (ctx.opts.dryRun || (!ctx.opts.yes && isInteractiveTTY())) return [];
  const manifest = loadManifest(ctx.opts.projectDir);
  return mcpArtifacts(ctx, partition.configIds).flatMap(artifact => {
    if (namedDirectly(ctx, artifact)) return [];
    const known = { ...recordedVars(manifest, artifact.id, ctx.target.name), ...ctx.varFlags };
    const missing = missingVars(artifact, known);
    if (missing.length === 0) return [];
    const flags = missing.map(name => `--var ${name}=<value>`).join(' ');
    const reason = `needs ${missing.join(', ')}; pass ${flags} to install it`;
    return [{ id: artifact.id, kind: artifact.kind, reason, cause: 'unrenderable' as const }];
  });
}

/** `partition` without the unasked picks, which join its skipped list after their advice prints. */
function leaveOutUnasked(ctx: PlanCtx, partition: PartitionedIds): PartitionedIds {
  const unasked = unaskedPicks(ctx, partition);
  if (unasked.length === 0) return partition;
  printSkippedAdvice(unasked, ctx.target);
  const ids = new Set(unasked.map(pick => pick.id));
  return {
    ...partition,
    configIds: partition.configIds.filter(id => !ids.has(id)),
    skipped: [...partition.skipped, ...unasked],
  };
}

/**
 * The value for every variable this plan's `mcp` artifacts declare, or null when the user
 * cancelled a prompt. An up-to-date artifact accepts flags for its names but resolves nothing, and
 * so does a pick left out for having no value.
 */
export async function resolvePlanVars(
  ctx: PlanCtx,
  partition: PartitionedIds,
): Promise<PlannedPartition | null> {
  const kept = leaveOutUnasked(ctx, partition);
  const leftOut = partition.configIds.filter(id => !kept.configIds.includes(id));
  const vars = await resolveAddVars({
    artifacts: mcpArtifacts(ctx, kept.configIds),
    upToDate: mcpArtifacts(ctx, [...partition.upToDateIds, ...leftOut]),
    flags: ctx.varFlags,
    recorded: id => recordedVars(loadManifest(ctx.opts.projectDir), id, ctx.target.name),
    dryRun: ctx.opts.dryRun,
    yes: ctx.opts.yes,
    interactive: isInteractiveTTY(),
    ask: askVar,
  });
  return vars === 'cancelled' ? null : { ...kept, vars };
}
