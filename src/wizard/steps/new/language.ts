import { select, isCancel, cancel } from '@clack/prompts';
import { buildLanguageOptions } from '../../../select';
import { requiresLanguage } from '../../../kinds';
import type { WizardStep, StepOutcome } from '../../engine';
import { BACK, type NewWizardState } from './state';

function filteredLangOpts(s: NewWizardState) {
  const isSkill = !!s.kind && requiresLanguage(s.kind);
  const langOpts = buildLanguageOptions(s.ctx.catalog.artifacts);
  // Skills must belong to a specific language (shared skills don't exist)
  return isSkill ? langOpts.filter(o => o.value !== '') : langOpts;
}

/** Language picker — auto-skipped when no languages are defined in the catalog yet. */
export const languageStep: WizardStep<NewWizardState> = {
  id: 'language',
  shouldShow: s => filteredLangOpts(s).length > 0,
  async run(s): Promise<StepOutcome> {
    const isSkill = !!s.kind && requiresLanguage(s.kind);
    const filtered = filteredLangOpts(s);

    const opts = [{ value: BACK, label: '← Back', hint: '' }, ...filtered];
    const langAnswer = await select({
      message: isSkill
        ? 'Language?  (skills must belong to a specific language)'
        : 'Language?  (choose a language or "All languages / shared")',
      options: opts,
      initialValue: s.language ?? filtered[0]?.value ?? '',
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
