/**
 * The home menu: what bare `sigil` opens in a terminal. It looks at the folder, shows what it
 * found, suggests the next step, runs whatever the user picks through the same code path as the
 * matching `sigil <verb>`, and returns to the menu until the user quits.
 *
 * Handlers are injected (see `home-actions.ts` for the real ones) so the loop is testable without
 * installing anything.
 *
 * @module
 */
import os from 'node:os';
import { intro, isCancel, log, note, outro, select } from '@clack/prompts';
import { detectProjectContext } from '../project-context';
import type { ProjectContext } from '../project-context';
import { SigilError } from '../errors';
import { confirmInstallFolder } from './folder-guard';
import { pickFolder } from './folder-picker';
import { buildMenu, describeContext } from './home-menu';
import type { HomeActionId } from './home-menu';

/** Runs one action against the folder the menu is currently looking at. */
export type HomeHandler = (projectDir: string) => Promise<void>;

export interface HomeDeps {
  handlers: Partial<Record<HomeActionId, HomeHandler>>;
  /** Ids in the bundled catalog, so orphaned artifacts can be spotted. Optional. */
  catalogIds?: () => Promise<Set<string> | undefined>;
  /** Overridable so tests never depend on the real home folder. */
  homeDir?: string;
}

/** Shows an action's failure as a message and keeps the menu alive. */
function showError(error: unknown): void {
  if (error instanceof SigilError) {
    log.error(error.message);
    if (error.hint) log.info(error.hint.trim());
  } else {
    log.error(error instanceof Error ? error.message : String(error));
  }
}

/** Runs an action's handler, showing its failure instead of leaving the menu. */
async function runHandler(choice: HomeActionId, dir: string, deps: HomeDeps): Promise<void> {
  const handler = deps.handlers[choice];
  if (!handler) {
    log.warn(`'${choice}' is not available here.`);
    return;
  }
  try {
    await handler(dir);
  } catch (error) {
    showError(error);
  }
}

/** Runs one menu choice. Returns the folder to use next. */
async function runChoice(
  choice: HomeActionId,
  ctx: ProjectContext,
  deps: HomeDeps,
): Promise<string> {
  const dir = ctx.projectDir;
  if (choice === 'change-folder') {
    return (await pickFolder(dir, deps.homeDir ?? os.homedir())) ?? dir;
  }
  if (choice === 'install' && !(await confirmInstallFolder(ctx))) return dir;
  await runHandler(choice, dir, deps);
  return dir;
}

export async function runHome(projectDir: string, deps: HomeDeps): Promise<void> {
  intro('sigil');
  let dir = projectDir;
  const catalogIds = await deps.catalogIds?.();
  for (;;) {
    const ctx = detectProjectContext(dir, {
      ...(catalogIds ? { catalogIds } : {}),
      ...(deps.homeDir ? { homeDir: deps.homeDir } : {}),
    });
    note(describeContext(ctx).join('\n'), 'This folder');
    const choice = await select({
      message: 'What would you like to do?',
      options: buildMenu(ctx).map(({ value, label, hint }) => ({ value, label, hint })),
    });
    if (isCancel(choice) || choice === 'quit') break;
    dir = await runChoice(choice as HomeActionId, ctx, deps);
  }
  outro('Bye. Run `sigil` any time to come back.');
}
