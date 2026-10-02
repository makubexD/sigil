import { select, isCancel } from '../../prompts';
import { cancel } from '../../frame';
import { buildLanguageOptions } from '../../../select';
import type { WizardStep, StepOutcome } from '../../engine';
import { BACK, type NewWizardState } from './state';

function languageOptions(s: NewWizardState) {
  return buildLanguageOptions(s.ctx.catalog.artifacts);
}

/**
 * Language picker — auto-skipped when no languages are defined in the catalog yet. Every kind,
 * skills included, may be shared ("All languages / shared" → catalog/shared/).
 */
export const languageStep: WizardStep<NewWizardState> = {
  id: 'language',
  shouldShow: s => languageOptions(s).length > 0,
  async run(s): Promise<StepOutcome> {
    const langOpts = languageOptions(s);
    const langAnswer = await select({
      message: 'Language?  (choose a language or "All languages / shared")',
      options: [{ value: BACK, label: '← Back', hint: '' }, ...langOpts],
      initialValue: s.language ?? langOpts[0]?.value ?? '',
    });
    if (isCancel(langAnswer)) {
      cancel('Scaffold cancelled.');
      return 'cancel';
    }
    if (langAnswer === BACK) return 'back';

    s.language = (langAnswer as string) || undefined;
    return 'next';
  },
};
