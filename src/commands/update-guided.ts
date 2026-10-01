/**
 * The guided half of `sigil update`: in a terminal, show what would change, then ask.
 *
 * `apply` is passed in rather than imported so this file and `update.ts` do not import each other.
 *
 * @module
 */
import { cancel, isCancel, log, select } from '@clack/prompts';
import { detectProjectTarget } from '../cli-helpers';
import { isInteractiveTTY } from '../wizard';
import { pickInstalled } from '../wizard/installed-picker';
import { requireManifest } from './shared/manifest';
import type { UpdateOptions, UpdateRunTotals } from './update';

export type ApplyUpdate = (
  ids: string[],
  opts: UpdateOptions,
) => Promise<UpdateRunTotals | undefined>;

type Choice = 'apply' | 'force' | 'pick' | 'cancel';

/** A terminal asks first; `--yes` and `--dry-run` never do, and neither does a pipe or CI. */
export function shouldGuideUpdate(opts: UpdateOptions): boolean {
  return isInteractiveTTY() && !opts.yes && !opts.dryRun;
}

function choicesFor(
  canPick: boolean,
  editedFiles: number,
): Array<{ value: Choice; label: string }> {
  const choices: Array<{ value: Choice; label: string }> = [
    { value: 'apply', label: 'Apply these updates' },
  ];
  if (editedFiles > 0) {
    choices.push({
      value: 'force',
      label: `Apply, and also overwrite the ${editedFiles} file(s) I edited`,
    });
  }
  if (canPick) choices.push({ value: 'pick', label: 'Let me choose which artifacts to update' });
  choices.push({ value: 'cancel', label: 'Cancel (change nothing)' });
  return choices;
}

async function askChoice(canPick: boolean, editedFiles: number): Promise<Choice> {
  const answer = await select({
    message: 'Apply these updates?',
    options: choicesFor(canPick, editedFiles),
  });
  return isCancel(answer) ? 'cancel' : (answer as Choice);
}

/** Ids to update after the user picks "choose which": null when they cancel. */
async function pickIds(opts: UpdateOptions): Promise<string[] | null> {
  const targetName = opts.target ?? detectProjectTarget(opts.projectDir, { verbose: false });
  const entries = requireManifest(opts.projectDir).entries.filter(e => e.target === targetName);
  const message = 'Which artifacts do you want to update?';
  return pickInstalled({ entries, projectDir: opts.projectDir, message });
}

function equivalentCommand(ids: string[], force: boolean): string {
  return ['sigil update', ...ids, force ? '--force' : '', '--yes'].filter(Boolean).join(' ');
}

export async function runGuidedUpdate(
  ids: string[],
  opts: UpdateOptions,
  apply: ApplyUpdate,
): Promise<void> {
  log.info('Here is what would change. Nothing is written until you confirm.');
  const preview = await apply(ids, { ...opts, dryRun: true });
  if (!preview) return;
  const choice = await askChoice(ids.length === 0, preview.skippedDrift);
  if (choice === 'cancel') {
    cancel('Nothing was changed.');
    return;
  }
  const chosen = choice === 'pick' ? await pickIds(opts) : ids;
  if (!chosen) return;
  const force = opts.force || choice === 'force';
  log.info(`Equivalent command: ${equivalentCommand(chosen, force)}`);
  await apply(chosen, { ...opts, force, dryRun: false, yes: true });
}
