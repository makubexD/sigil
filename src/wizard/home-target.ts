/**
 * Which tool (Claude Code, Copilot) a menu action should act on. The commands act on one target at
 * a time, so without this a folder with installs for both would silently show only the first.
 *
 * @module
 */
import { isCancel, select } from '@clack/prompts';
import { loadManifest } from '../manifest';
import { getAllTargets } from '../targets';

/** Names of the tools that have something installed in `dir`, in the order first recorded. */
export function installedTargets(dir: string): string[] {
  try {
    return [...new Set(loadManifest(dir).entries.map(e => e.target))];
  } catch {
    return []; // a damaged record is the repair action's job
  }
}

const displayName = (name: string): string =>
  getAllTargets().find(t => t.name === name)?.displayName ?? name;

/**
 * The tool to act on: the only one with installs, or the user's pick when more than one has.
 * `undefined` means "nothing to choose, let the command decide"; `null` means the user cancelled.
 */
export async function chooseInstalledTarget(dir: string): Promise<string | undefined | null> {
  const names = installedTargets(dir);
  if (names.length <= 1) return names[0];
  const answer = await select({
    message: 'Which tool?',
    options: names.map(value => ({ value, label: displayName(value) })),
  });
  return isCancel(answer) ? null : String(answer);
}
