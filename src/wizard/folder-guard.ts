/**
 * A last check before writing into a folder that is almost certainly not the project the user
 * means: their home folder, the top of a drive, or a sigil catalog checkout. It shows why, then
 * offers a way out in the same step: pick the right folder, go ahead, or back to the menu.
 *
 * @module
 */
import { isCancel, log, select } from '@clack/prompts';
import { riskyFolderReason, samePath } from '../project-context';
import type { ProjectContext } from '../project-context';
import { pickFolder } from './folder-picker';

/** `go`: write here anyway. `move`: choose another folder first. `back`: do nothing. */
type GuardAnswer = 'go' | 'move' | 'back';

/** Warns why the folder looks wrong and asks what to do. Cancelling counts as `back`. */
async function askGuard(ctx: ProjectContext, verb: string): Promise<GuardAnswer> {
  log.warn(riskyFolderReason(ctx) ?? '');
  const answer = await select<GuardAnswer>({
    message: `Where should sigil ${verb}?`,
    options: [
      { value: 'move', label: 'Pick another folder', hint: `then ${verb} there` },
      { value: 'go', label: 'Use this folder anyway', hint: ctx.projectDir },
      { value: 'back', label: 'Back to the menu' },
    ],
    initialValue: 'move',
  });
  return isCancel(answer) ? 'back' : answer;
}

/** The folder a write should go to, and whether the user accepted a warning to get there. */
export interface GuardedFolder {
  ctx: ProjectContext;
  acknowledgedRisk: boolean;
}

export interface GuardDeps {
  /** Reads a folder's state, so a folder picked here is checked like the first one. */
  read: (dir: string) => ProjectContext;
  homeDir: string;
}

/**
 * Settles where `verb` ("install", "set up the project") should write. A normal folder is used as is.
 * A risky one is explained first; the user can pick another folder (checked in turn), go ahead, or
 * back out, which returns `null` and means do nothing.
 */
export async function guardFolder(
  start: ProjectContext,
  verb: string,
  deps: GuardDeps,
): Promise<GuardedFolder | null> {
  let ctx = start;
  while (riskyFolderReason(ctx) !== undefined) {
    const answer = await askGuard(ctx, verb);
    if (answer === 'back') return null;
    if (answer === 'go') return { ctx, acknowledgedRisk: true };
    const moved = await pickFolder(ctx.projectDir, deps.homeDir, { leaving: ctx.projectDir });
    if (moved === null) return null;
    if (samePath(moved, ctx.projectDir)) log.info('That is the same folder. Pick a different one.');
    else ctx = deps.read(moved);
  }
  return { ctx, acknowledgedRisk: false };
}
