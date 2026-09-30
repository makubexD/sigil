/**
 * `sigil add` — candidate-id resolution and manifest-aware up-to-date detection.
 * Split out of plan.ts to keep that file under the repo's own module-size threshold.
 *
 * @module
 */
import { resolveSelection, type SkippedArtifact } from '../../select';
import { SigilError } from '../../errors';
import { computeInstallStates } from '../../install-state';
import type { PlanCtx } from './plan-context';

/** Resolves the candidate artifact ids + skipped list for this install; wraps errors in SigilError. */
export function resolveIds(
  ctx: PlanCtx,
  filters: Parameters<typeof resolveSelection>[0]['filters'],
): { ids: string[]; skipped: SkippedArtifact[] } {
  try {
    return resolveSelection({
      selectors: ctx.inputs.selectors,
      filters,
      catalog: ctx.resolved,
      packs: ctx.packs,
      supportedKinds: ctx.target.supportedKinds ?? [],
      targetName: ctx.targetName,
    });
  } catch (err) {
    throw new SigilError((err as Error).message, { cause: err });
  }
}

/** Computes ids already up to date (manifest-aware), printing a skip line for each; [] on failure/dry-run. */
export async function computeUpToDateIds(ctx: PlanCtx, ids: string[]): Promise<string[]> {
  if (ctx.opts.dryRun || ids.length === 0) return [];
  try {
    const installStates = await computeInstallStates({
      candidateIds: ids,
      target: ctx.target,
      catalog: ctx.resolved,
      projectDir: ctx.opts.projectDir,
      scope: ctx.inputs.scope,
    });
    if (ctx.inputs.overwrite) return [];
    const upToDateIds = ids.filter(id => installStates.get(id)?.state === 'up-to-date');
    for (const id of upToDateIds) {
      console.log(`  =  ${id}  (✓ already up to date — skipped)`);
    }
    return upToDateIds;
  } catch {
    // State detection failed — proceed without skip logic (safe fallback)
    return [];
  }
}
