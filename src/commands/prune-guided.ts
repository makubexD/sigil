/**
 * The guided half of `sigil prune`: after the preview, a terminal can apply it on the spot.
 *
 * @module
 */
import { confirm, isCancel, log } from '../wizard/prompts';
import { cancel } from '../wizard/frame';
import { locationFlags, printRepeatCommand } from '../wizard/command-strings';
import { isInteractiveTTY } from '../wizard';
import type { requireManifest } from './shared/manifest';
import type { ApplyPruneCtx } from './prune-apply';
import { applyPrune } from './prune-apply';
import type { PruneCandidates, PruneOptions } from './prune';
import { editedFilesToDelete, removableEntries } from './prune-apply';

/** Only a terminal is asked, only for a plain preview, and only when something would be removed. */
export function shouldOfferApply(opts: PruneOptions, candidates: PruneCandidates): boolean {
  return isInteractiveTTY() && !opts.apply && !opts.json && removableEntries(candidates).length > 0;
}

/** The command that repeats the confirmed prune: `--force`, the target and the folder in effect. */
export function equivalentPrune(opts: PruneOptions, targetName: string): string {
  const parts = ['sigil prune --apply --yes', opts.force ? '--force' : ''];
  return [...parts, ...locationFlags({ target: targetName, projectDir: opts.projectDir })]
    .filter(Boolean)
    .join(' ');
}

/** With `--force`, names the files the user edited that the apply would delete with the rest. */
function warnEditedFiles(
  manifest: ReturnType<typeof requireManifest>,
  candidates: PruneCandidates,
  ctx: ApplyPruneCtx,
): void {
  if (!ctx.opts.force) return;
  const where = { targetName: ctx.targetName, projectDir: ctx.opts.projectDir };
  const edited = editedFilesToDelete(manifest, candidates, where);
  if (edited.length === 0) return;
  log.warn(
    `--force also deletes ${edited.length} file(s) you edited:\n` +
      edited.map(p => `  ${p}`).join('\n'),
  );
}

/** Asks whether to remove the artifacts just previewed; declining changes nothing. */
export async function offerApply(
  manifest: ReturnType<typeof requireManifest>,
  candidates: PruneCandidates,
  ctx: ApplyPruneCtx,
): Promise<void> {
  warnEditedFiles(manifest, candidates, ctx);
  const ok = await confirm({
    message: `Remove the ${removableEntries(candidates).length} artifact(s) listed above now?`,
    initialValue: false,
  });
  if (isCancel(ok) || !ok) {
    cancel('Nothing was changed.');
    return;
  }
  printRepeatCommand('Equivalent command:', equivalentPrune(ctx.opts, ctx.targetName));
  await applyPrune(manifest, candidates, { ...ctx, opts: { ...ctx.opts, apply: true, yes: true } });
}
