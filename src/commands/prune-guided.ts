/**
 * The guided half of `sigil prune`: after the preview, a terminal can apply it on the spot.
 *
 * @module
 */
import { cancel, confirm, isCancel, log } from '@clack/prompts';
import { isInteractiveTTY } from '../wizard';
import type { requireManifest } from './shared/manifest';
import type { ApplyPruneCtx } from './prune-apply';
import { applyPrune } from './prune-apply';
import type { PruneCandidates, PruneOptions } from './prune';

/** Only a terminal is asked, only for a plain preview, and only when something would be removed. */
export function shouldOfferApply(opts: PruneOptions, candidates: PruneCandidates): boolean {
  return isInteractiveTTY() && !opts.apply && !opts.json && candidates.orphaned.length > 0;
}

/** Asks whether to remove the orphaned artifacts just previewed; declining changes nothing. */
export async function offerApply(
  manifest: ReturnType<typeof requireManifest>,
  candidates: PruneCandidates,
  ctx: ApplyPruneCtx,
): Promise<void> {
  const ok = await confirm({
    message: `Remove the ${candidates.orphaned.length} orphaned artifact(s) listed above now?`,
    initialValue: false,
  });
  if (isCancel(ok) || !ok) {
    cancel('Nothing was changed.');
    return;
  }
  log.info('Equivalent command: sigil prune --apply --yes');
  await applyPrune(manifest, candidates, { ...ctx, opts: { ...ctx.opts, apply: true, yes: true } });
}
