import { select, isCancel, cancel } from '@clack/prompts';
import { partitionConfigKinds, buildLanguageOptions } from '../../../select';
import type { WizardStep, StepOutcome } from '../../engine';
import { BACK, visibleArtifacts, type AddWizardState } from './state';

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
    return buildLanguageOptions(codeArtifacts).length > 1;
  },
  async run(s): Promise<StepOutcome> {
    const { rest: codeArtifacts } = partitionConfigKinds(visibleArtifacts(s));
    const langOpts = buildLanguageOptions(codeArtifacts);
    const opts = [{ value: BACK, label: '← Back', hint: '' }, ...langOpts];
    const langAnswer = await select({
      message: 'Narrow to a language?  (MCPs, hooks & settings are always included)',
      options: opts,
      initialValue: s.language ?? '',
    });
    if (isCancel(langAnswer)) {
      cancel('Install cancelled.');
      return 'cancel';
    }
    if (langAnswer === BACK) return 'back';

    s.language = (langAnswer as string) || undefined;
    return 'next';
  },
};
