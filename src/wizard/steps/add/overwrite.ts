import { select, note } from '@clack/prompts';
import type { WizardStep, StepOutcome } from '../../engine';
import type { AddWizardState } from './state';
import { BACK_OPTION, resolveOutcome } from './prompt-helpers';

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
