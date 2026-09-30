import { select, note, isCancel, cancel } from '@clack/prompts';
import type { WizardStep, StepOutcome } from '../../engine';
import { BACK, type AddWizardState } from './state';

/** "Overwrite existing files if conflicts are found?" — always shown. */
export const overwriteStep: WizardStep<AddWizardState> = {
  id: 'overwrite',
  async run(s): Promise<StepOutcome> {
    note(
      'No keeps your existing files and lists any conflicts at the end.\n' +
        'Yes replaces them in place — equivalent to --overwrite.',
      'About conflicts',
    );
    const answer = await select({
      message: 'Overwrite existing files if conflicts are found?',
      options: [
        { value: 'no', label: 'No', hint: 'warn and list conflicts (safe default)' },
        { value: 'yes', label: 'Yes', hint: 'replace existing files (--overwrite)' },
        { value: BACK, label: '← Back', hint: '' },
      ],
      initialValue: s.overwrite ? 'yes' : 'no',
    });
    if (isCancel(answer)) {
      cancel('Install cancelled.');
      return 'cancel';
    }
    if (answer === BACK) return 'back';

    s.overwrite = answer === 'yes';
    return 'next';
  },
};
