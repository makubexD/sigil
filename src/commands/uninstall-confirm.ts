/**
 * The confirmation half of `sigil uninstall`: what to do with files the user edited after install,
 * and the final "remove these?" question. Split out of `uninstall.ts`.
 *
 * @module
 */
import { confirm, isCancel, cancel, note, select } from '@clack/prompts';
import { isInteractiveTTY } from '../wizard';
import { SigilError } from '../errors';

/** The flags that decide whether to ask. A structural subset of `UninstallOptions`. */
export interface ConfirmOptions {
  yes: boolean;
  force: boolean;
}

/** Prints the "N file(s) were edited after install" note box, ending with `tail` (what happens next). */
function printEditedFilesNote(editedPaths: string[], tail: string): void {
  note(
    `${editedPaths.length} file(s) were edited after install:\n` +
      editedPaths.map(p => `  ${p}`).join('\n') +
      `\n\n${tail}`,
    '⚠  Files you edited',
  );
}

/** In a terminal: keep the edited files (they stay active) or delete them too. null = cancelled. */
async function askAboutEditedFiles(editedPaths: string[]): Promise<boolean | null> {
  printEditedFilesNote(editedPaths, 'Removing the artifact normally keeps files you edited.');
  const answer = await select({
    message: 'What should happen to the files you edited?',
    options: [
      { value: 'keep', label: 'Keep them', hint: 'they stay active; sigil stops tracking them' },
      { value: 'delete', label: 'Delete them too', hint: 'my edits are lost' },
    ],
    initialValue: 'keep',
  });
  if (isCancel(answer)) {
    cancel('Uninstall cancelled.');
    return null;
  }
  return answer === 'delete';
}

/** Prompts to confirm the uninstall (skipped when --yes). Returns false if cancelled. */
async function promptUninstallConfirmation(ids: string[], targetName: string): Promise<boolean> {
  const ok = await confirm({
    message: `Remove ${ids.join(', ')} from '${targetName}'?`,
    initialValue: false,
  });
  if (isCancel(ok) || !ok) {
    cancel('Uninstall cancelled.');
    return false;
  }
  return true;
}

/**
 * Whether edited files are deleted too: asked in a terminal, otherwise kept unless `--force`.
 * `null` means the user cancelled.
 */
async function resolveEditedFiles(
  editedPaths: string[],
  opts: ConfirmOptions,
): Promise<boolean | null> {
  if (editedPaths.length === 0 || opts.force) return opts.force;
  if (!opts.yes && isInteractiveTTY()) return askAboutEditedFiles(editedPaths);
  printEditedFilesNote(
    editedPaths,
    'They will be kept and stay active. Add --force to delete them too.',
  );
  return false;
}

/**
 * Handles files edited after install, then confirms the uninstall unless --yes was passed.
 * Returns whether edited files are deleted too (`force`), or null when the user cancelled.
 * Throws if non-interactive without --yes.
 */
export async function confirmUninstall(
  ids: string[],
  targetName: string,
  editedPaths: string[],
  opts: ConfirmOptions,
): Promise<{ force: boolean } | null> {
  const force = await resolveEditedFiles(editedPaths, opts);
  if (force === null) return null;
  if (opts.yes) return { force };
  if (!isInteractiveTTY()) {
    throw new SigilError('stdin/stdout is not interactive. Re-run with --yes to confirm.');
  }
  return (await promptUninstallConfirmation(ids, targetName)) ? { force } : null;
}
