/**
 * Menu-only: set a damaged install record aside so sigil can start a fresh one.
 *
 * Nothing is deleted: the damaged file is renamed next to the original so a person can still read
 * it. Files that sigil installed stay where they are; they just stop being tracked.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { cancel, confirm, isCancel, log } from '@clack/prompts';
import { manifestPath } from '../manifest';

/** Renames the manifest to `manifest.damaged-<timestamp>.json`. Returns the new path, or null if none. */
export function setAsideManifest(projectDir: string, now: Date = new Date()): string | null {
  const from = manifestPath(projectDir);
  if (!fs.existsSync(from)) return null;
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const to = path.join(path.dirname(from), `manifest.damaged-${stamp}.json`);
  fs.renameSync(from, to);
  return to;
}

/** Asks first, then sets the damaged record aside and says what to do next. */
export async function runRepair(projectDir: string): Promise<void> {
  const go = await confirm({
    message:
      'Set the damaged install record aside and start a fresh one? ' +
      'Files already installed stay where they are, but sigil stops tracking them.',
    initialValue: true,
  });
  if (isCancel(go) || !go) {
    cancel('Nothing was changed.');
    return;
  }
  const saved = setAsideManifest(projectDir);
  log.success(saved ? `Damaged record kept as ${saved}` : 'There was no install record to repair.');
  log.info("Next: choose 'Install artifacts'. sigil asks before replacing a file it finds there.");
}
