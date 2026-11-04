/**
 * `sigil add` — candidate-id resolution and manifest-aware up-to-date detection.
 * Split out of plan.ts to keep that file under the repo's own module-size threshold.
 *
 * @module
 */
import { resolveSelection, type SelectionResult } from '../../select';
import { SigilError } from '../../errors';
import { skipRefused } from '../../overlay-report';
import { computeInstallStates } from '../../install-state';
import { loadManifest, recordedVars, sameDestination } from '../../manifest';
import { CONFIG_KINDS } from '../../select';
import { printSkippedAdvice } from '../../wizard';
import { printPluginCheckWarnings, printPluginOverlapAdvice } from '../../wizard/command-strings';
import { scaffoldConfigOps } from '../../config-ops';
import { declaredVarNames, missingVars, usableVars } from '../../mcp-vars';
import type { Manifest } from '../../manifest';
import type { PluginOverlap } from '../../plugin-overlap';
import type { PartitionedIds, PlanCtx } from './plan-context';
import { complement, computePluginOverlaps } from './plan-context';
import { carriedKinds, installableKinds } from '../../targets/capabilities';
import { installSkipReason } from '../../targets/install-skip';

type Filters = Parameters<typeof resolveSelection>[0]['filters'];

/**
 * Resolves the candidate artifact ids + skipped list for this install; wraps errors in SigilError.
 * An id whose overlay was refused is skipped, never installed wider than the project asked.
 */
export function resolveIds(ctx: PlanCtx, filters: Filters): SelectionResult {
  return skipRefused(select(ctx, filters), ctx.refusedOverlays, ctx.resolved);
}

function select(ctx: PlanCtx, filters: Filters): SelectionResult {
  try {
    return resolveSelection({
      selectors: ctx.inputs.selectors,
      filters,
      catalog: ctx.resolved,
      packs: ctx.packs,
      supportedKinds: installableKinds(ctx.target),
      carriedKinds: carriedKinds(ctx.target),
      targetName: ctx.targetName,
      skipReason: a => installSkipReason(ctx.target, a),
    });
  } catch (err) {
    throw new SigilError((err as Error).message, { cause: err });
  }
}

/** Splits resolved ids into whole-file vs config-kind, excluding already-up-to-date ids from both. */
function partitionIdsByKind(
  ids: string[],
  resolved: PlanCtx['resolved'],
  upToDateSet: Set<string>,
): { wholeFileIds: string[]; configIds: string[] } {
  const wholeFileIds = ids.filter(
    id => !CONFIG_KINDS.has(resolved.byId.get(id)?.kind ?? '') && !upToDateSet.has(id),
  );
  const configIds = ids.filter(
    id => CONFIG_KINDS.has(resolved.byId.get(id)?.kind ?? '') && !upToDateSet.has(id),
  );
  return { wholeFileIds, configIds };
}

/** Refuses skills for a target whose skill files another target already installed here. */
function refuseSharedSkillFiles(ctx: PlanCtx, ids: readonly string[]): void {
  const peers = ctx.target.sharesSkillFilesWith ?? [];
  if (!ids.some(id => ctx.resolved.byId.get(id)?.kind === 'skill')) return;
  const entries = loadManifest(ctx.opts.projectDir)?.entries ?? [];
  const peer = peers.find(name => entries.some(e => e.target === name && e.kind === 'skill'));
  if (peer === undefined) return;
  throw new SigilError(
    `${peer} already installed skills in this project, and ${ctx.target.name} writes the same files.`,
    {
      hint: `Keep ${peer}, or remove its skills with sigil uninstall <ids> --target ${peer} first.`,
    },
  );
}

/** Resolves candidate ids, prints skip advice, and splits them into whole-file vs config-kind. */
export async function resolveAndPartitionIds(
  ctx: PlanCtx,
  filters: Filters,
): Promise<PartitionedIds> {
  const { ids: resolvedIds, skipped } = resolveIds(ctx, filters);
  const { overlaps, warnings } = computePluginOverlaps(ctx, resolvedIds);
  printPluginCheckWarnings(warnings);
  const ids = ctx.inputs.complement ? complement(ctx, resolvedIds, skipped, overlaps) : resolvedIds;
  const shown = ctx.inputs.complement ? new Map<string, PluginOverlap>() : overlaps;

  printSkippedAdvice(skipped, ctx.target);
  // The wizard's plan box already showed this advisory (decision 11), so print it only for a typed add.
  if (!ctx.inputs.fromWizard) printPluginOverlapAdvice(shown);
  refuseSharedSkillFiles(ctx, ids);

  const upToDateIds = await computeUpToDateIds(ctx, ids);
  const { wholeFileIds, configIds } = partitionIdsByKind(ids, ctx.resolved, new Set(upToDateIds));

  return { skipped, pluginOverlaps: shown, upToDateIds, wholeFileIds, configIds };
}

/**
 * Whether config artifact `id` is installed where this `add` would write it: every op at the
 * requested scope lands on a destination the manifest records. An up-to-date fragment at project
 * scope says nothing about local scope. Whole-file artifacts have one destination: always true.
 * A declared variable with no usable value (a flag, or the recorded one) is never at scope.
 */
async function installedAtScope(ctx: PlanCtx, id: string): Promise<boolean> {
  if (!CONFIG_KINDS.has(ctx.resolved.byId.get(id)?.kind ?? '')) return true;
  if (!ctx.target.scaffoldConfig) return false;
  const { projectDir } = ctx.opts;
  const manifest = loadManifest(projectDir);
  const entry = manifest.entries.find(e => e.id === id && e.target === ctx.target.name);
  const values = { ...recordedVars(manifest, id, ctx.target.name), ...ctx.varFlags };
  const artifact = ctx.resolved.byId.get(id);
  if (artifact !== undefined && missingVars(artifact, values).length > 0) return false;
  const ops = await scaffoldConfigOps(ctx.target, id, ctx.resolved, {
    projectDir,
    scope: ctx.inputs.scope,
    vars: values,
  });
  return ops.every(op => entry?.configFiles?.some(cf => sameDestination(cf, op)) ?? false);
}

/** Whether a flag changes a declared name's value from what the artifact's own entry recorded. */
function flagValueDiffers(ctx: PlanCtx, manifest: Manifest, id: string): boolean {
  const artifact = ctx.resolved.byId.get(id);
  if (artifact === undefined) return false;
  const own = manifest.entries.find(e => e.id === id && e.target === ctx.target.name);
  const recorded = usableVars(own?.vars);
  return declaredVarNames(artifact).some(
    name =>
      Object.hasOwn(ctx.varFlags, name) &&
      (Object.hasOwn(recorded, name) ? recorded[name] : undefined) !== ctx.varFlags[name],
  );
}

/** The ids up to date where this `add` would write them: install state, changed flags, then scope. */
async function upToDateAtScope(ctx: PlanCtx, ids: string[]): Promise<string[]> {
  const installStates = await computeInstallStates({
    candidateIds: ids,
    target: ctx.target,
    catalog: ctx.resolved,
    projectDir: ctx.opts.projectDir,
    refused: ctx.refusedOverlays,
  });
  const manifest = loadManifest(ctx.opts.projectDir);
  const upToDate = ids.filter(
    id => installStates.get(id)?.state === 'up-to-date' && !flagValueDiffers(ctx, manifest, id),
  );
  const atScope = await Promise.all(upToDate.map(id => installedAtScope(ctx, id)));
  return upToDate.filter((_, i) => atScope[i]);
}

/** Computes ids already up to date (manifest-aware), printing a skip line for each; [] on failure/dry-run. */
export async function computeUpToDateIds(ctx: PlanCtx, ids: string[]): Promise<string[]> {
  if (ctx.opts.dryRun || ids.length === 0 || ctx.inputs.overwrite) return [];
  try {
    const upToDateIds = await upToDateAtScope(ctx, ids);
    for (const id of upToDateIds) {
      console.log(`  =  ${id}  (✓ already up to date — skipped)`);
    }
    return upToDateIds;
  } catch {
    // State detection failed — proceed without skip logic (safe fallback)
    return [];
  }
}
