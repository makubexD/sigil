/**
 * The short "What next?" menu shown right after an install or a set up. Pure, like `buildMenu`: it
 * depends only on a `ProjectContext`, so every folder state is a test fixture.
 *
 * @module
 */
import type { ProjectContext } from '../project-context';
import {
  healthSummary,
  hasToolToSetUp,
  initHint,
  initLabel,
  installedSummary,
  targetNames,
  topRecommendation,
} from './home-menu';
import type { BuildMenuOptions, HomeActionId, MenuItem } from './home-menu';

/** What just finished: it decides which short "What next?" menu follows. */
export type FinishedAction = 'install' | 'init';

const row = (value: HomeActionId, label: string, hint = ''): MenuItem => ({
  value,
  label,
  hint,
  recommended: false,
});

/**
 * The short menu shown right after an install or a set up, or `undefined` when something more
 * urgent than "install" is recommended (repair, restore, update…): the full menu shows that then.
 * Done leads after an install, Install leads after a set up, so Enter alone never adds a tool.
 */
export function buildNextMenu(
  ctx: ProjectContext,
  after: FinishedAction,
  opts: BuildMenuOptions = {},
): MenuItem[] | undefined {
  const top = topRecommendation(ctx, opts.dismissed);
  if (top && top.action !== 'install') return undefined;
  const done = row('quit', 'Done', 'Leave sigil');
  const all = row('all', 'Show all options');
  if (after === 'init') return [row('install', 'Install artifacts'), done, all];
  const check = ctx.installed > 0 ? [row('status', "Check what's installed")] : [];
  const another = hasToolToSetUp(ctx) ? [row('init', initLabel(ctx), initHint(ctx))] : [];
  return [done, row('install', 'Install more'), ...check, ...another, all];
}

/** One line for the top of the short menu, e.g. "Claude Code: 19 installed · all healthy". */
export function nextSummary(ctx: ProjectContext): string {
  const tools = targetNames(ctx);
  const state =
    ctx.installed === 0
      ? 'nothing installed yet'
      : `${installedSummary(ctx)} · ${healthSummary(ctx)}`;
  return tools ? `${tools}: ${state}` : state;
}
