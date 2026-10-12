/**
 * The guided half of `sigil prune`: after the preview, a terminal can apply it on the spot.
 *
 * @module
 */
import { confirm, isCancel } from '../wizard/prompts';
import { cancel } from '../wizard/frame';
import { printRepeatCommand } from '../wizard/command-strings';
import { isInteractiveTTY } from '../wizard';
import type { requireManifest } from './shared/manifest';
import type { ApplyPruneCtx } from './prune-apply';
import { applyPrune } from './prune-apply';
import type { PruneCandidates, PruneOptions } from './prune';
import { removableEntries } from './prune-apply';

/** Only a terminal is asked, only for a plain preview, and only when something would be removed. */
export function shouldOfferApply(opts: PruneOptions, candidates: PruneCandidates): boolean {
  return isInteractiveTTY() && !opts.apply && !opts.json && removableEntries(candidates).length > 0;
}

/** Asks whether to remove the artifacts just previewed; declining changes nothing. */
export async function offerApply(
  manifest: ReturnType<typeof requireManifest>,
  candidates: PruneCandidates,
  ctx: ApplyPruneCtx,
): Promise<void> {
  const ok = await confirm({
    message: `Remove the ${removableEntries(candidates).length} artifact(s) listed above now?`,
    initialValue: false,
  });
  if (isCancel(ok) || !ok) {
    cancel('Nothing was changed.');
    return;
  }
  printRepeatCommand('Equivalent command:', 'sigil prune --apply --yes');
  await applyPrune(manifest, candidates, { ...ctx, opts: { ...ctx.opts, apply: true, yes: true } });
}
