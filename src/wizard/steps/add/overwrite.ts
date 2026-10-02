import { select, note } from '../../prompts';
import type { ArtifactInstallState, InstallState } from '../../../install-state';
import type { WizardStep, StepOutcome } from '../../engine';
import type { AddWizardState } from './state';
import { BACK_OPTION, resolveOutcome } from './prompt-helpers';
import { conflictsFor } from './plan-preview';

/** Why each conflicting state would be touched, in words a first-timer understands. */
const WHY: Partial<Record<InstallState, string>> = {
  foreign: 'a file with this name is already there, and sigil did not put it there',
  drifted: 'you edited it after installing',
  outdated: 'the catalog has a newer version',
};

function conflictLines(conflicts: ArtifactInstallState[]): string {
  return conflicts.map(c => `  ${c.id}  —  ${WHY[c.state] ?? c.state}`).join('\n');
}

function showConflictNote(s: AddWizardState): void {
  note(
    [
      'These are already on disk and are not an untouched sigil install:',
      conflictLines(conflictsFor(s)),
      '',
      'Keeping them is safe: sigil skips these and installs the rest.',
      'Replacing them overwrites the files; your own edits to them are lost.',
    ].join('\n'),
    'Some files already exist',
  );
}

/**
 * "Replace files that are already there?" Asked only when the install would meet files that are
 * already on disk and are not an untouched sigil install; with nothing to conflict there is
 * nothing to ask, and `s.overwrite` stays false.
 */
export const overwriteStep: WizardStep<AddWizardState> = {
  id: 'overwrite',
  shouldShow: s => conflictsFor(s).length > 0,
  async run(s): Promise<StepOutcome> {
    showConflictNote(s);
    const answer = await select({
      message: 'Replace these files with the catalog version?',
      options: [
        { value: 'no', label: 'No, keep my files', hint: 'skip these, install the rest (safe)' },
        { value: 'yes', label: 'Yes, replace them', hint: 'my changes to them are lost' },
        BACK_OPTION,
      ],
      initialValue: s.overwrite ? 'yes' : 'no',
    });
    const outcome = resolveOutcome(answer);
    if (outcome) return outcome;

    s.overwrite = answer === 'yes';
    return 'next';
  },
};
