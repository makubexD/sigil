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
import { loadManifest, sameDestination } from '../../manifest';
import { CONFIG_KINDS } from '../../select';
import type { PlanCtx } from './plan-context';
import { carriedKinds, installableKinds } from '../../targets/capabilities';

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
    });
  } catch (err) {
    throw new SigilError((err as Error).message, { cause: err });
  }
}

/**
 * Whether config artifact `id` is installed where this `add` would write it: every op at the
 * requested scope lands on a destination the manifest records. An up-to-date fragment at project
 * scope says nothing about local scope. Whole-file artifacts have one destination: always true.
 */
async function installedAtScope(ctx: PlanCtx, id: string): Promise<boolean> {
  if (!CONFIG_KINDS.has(ctx.resolved.byId.get(id)?.kind ?? '')) return true;
  if (!ctx.target.scaffoldConfig) return false;
  const { projectDir } = ctx.opts;
  const entry = loadManifest(projectDir).entries.find(
    e => e.id === id && e.target === ctx.target.name,
  );
  const ops = await ctx.target.scaffoldConfig(id, ctx.resolved, {
    projectDir,
    scope: ctx.inputs.scope,
  });
  return ops.every(op => entry?.configFiles?.some(cf => sameDestination(cf, op)) ?? false);
}

/** The ids up to date where this `add` would write them: install state, then scope. */
async function upToDateAtScope(ctx: PlanCtx, ids: string[]): Promise<string[]> {
  const installStates = await computeInstallStates({
    candidateIds: ids,
    target: ctx.target,
    catalog: ctx.resolved,
    projectDir: ctx.opts.projectDir,
    refused: ctx.refusedOverlays,
  });
  const upToDate = ids.filter(id => installStates.get(id)?.state === 'up-to-date');
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
