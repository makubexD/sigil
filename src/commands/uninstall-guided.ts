/**
 * The guided half of `sigil uninstall`: with no ids, offer what is installed.
 *
 * @module
 */
import { log } from '@clack/prompts';
import { SigilError } from '../errors';
import { isInteractiveTTY } from '../wizard';
import { pickInstalled } from '../wizard/installed-picker';
import type { ManifestEntry } from '../manifest';

/** Outside a terminal there is nobody to ask, so say how to name the artifacts instead. */
function assertCanAsk(): void {
  if (isInteractiveTTY()) return;
  throw new SigilError('Name the artifacts to remove.', {
    hint: '  sigil uninstall <id> [<id>...]\n  Run `sigil status` to see the installed ids.',
  });
}

/**
 * No ids were given: in a terminal, pick from what is installed. Returns the chosen ids, or null
 * when there is nothing to do (nothing installed, or the user cancelled).
 */
export async function chooseIdsToUninstall(
  entries: readonly ManifestEntry[],
  targetName: string,
  projectDir: string,
): Promise<string[] | null> {
  assertCanAsk();
  const installed = entries.filter(e => e.target === targetName);
  if (installed.length === 0) {
    console.log(`\n  Nothing is installed for '${targetName}'.\n`);
    return null;
  }
  const message = 'Which artifacts do you want to remove?';
  const picked = await pickInstalled({ entries: installed, projectDir, message });
  if (picked) log.info(`Equivalent command: sigil uninstall ${picked.join(' ')}`);
  return picked;
}
