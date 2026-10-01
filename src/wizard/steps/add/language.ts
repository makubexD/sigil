import { select } from '@clack/prompts';
import { partitionConfigKinds, buildLanguageOptions, hasLanguageChoice } from '../../../select';
import type { WizardStep, StepOutcome } from '../../engine';
import { visibleArtifacts, type AddWizardState } from './state';
import { BACK_OPTION, resolveOutcome } from './prompt-helpers';

/**
 * Optional language narrowing — only the 'all' scope reaches it; pack and browse
 * selections already carry their own language via their own pickers. Auto-skipped
 * (no prompt, `s.language` stays whatever it was) when ≤1 language is present.
 */
export const languageStep: WizardStep<AddWizardState> = {
  id: 'language',
  shouldShow: s => {
    if (s.scope !== 'all') return false;
    const { rest: codeArtifacts } = partitionConfigKinds(visibleArtifacts(s));
    return hasLanguageChoice(codeArtifacts);
  },
  async run(s): Promise<StepOutcome> {
    const { rest: codeArtifacts } = partitionConfigKinds(visibleArtifacts(s));
    const langOpts = buildLanguageOptions(codeArtifacts);
    const opts = [BACK_OPTION, ...langOpts];
    const langAnswer = await select({
      message: 'Narrow to a language?  (MCPs, hooks & settings are always included)',
      options: opts,
      initialValue: s.language ?? '',
    });
    const outcome = resolveOutcome(langAnswer);
    if (outcome) return outcome;

    s.language = (langAnswer as string) || undefined;
    return 'next';
  },
};
