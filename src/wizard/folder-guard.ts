/**
 * A last check before installing into a folder that is almost certainly not the project the user
 * means: their home folder, the top of a drive, or a sigil catalog checkout.
 *
 * @module
 */
import { confirm, isCancel } from '@clack/prompts';
import { riskyFolderReason } from '../project-context';
import type { ProjectContext } from '../project-context';

/** True when it is fine to install: the folder looks normal, or the user said to go ahead. */
export async function confirmInstallFolder(ctx: ProjectContext): Promise<boolean> {
  const reason = riskyFolderReason(ctx);
  if (reason === undefined) return true;
  const go = await confirm({
    message: `${reason}\nInstall into ${ctx.projectDir} anyway?`,
    initialValue: false,
  });
  return !isCancel(go) && go;
}
