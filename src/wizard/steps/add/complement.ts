/**
 * The `--complement` choice: shown only when the preview found a pick an enabled plugin already
 * delivers, so offering to skip is never a question with nothing to skip.
 *
 * @module
 */
import { select } from '../../prompts';
import type { WizardStep, StepOutcome } from '../../engine';
import { previewPluginOverlaps } from './plan-preview';
import { BACK_OPTION, resolveOutcome } from './prompt-helpers';
import { planSelection } from './proceed';
import type { AddWizardState } from './state';

/** True when at least one id the plan covers is also delivered by an enabled plugin. */
function hasPluginOverlap(s: AddWizardState): boolean {
  return previewPluginOverlaps(s, planSelection(s).ids).size > 0;
}

/**
 * "Install them anyway" (plain `add`'s default) or "Skip what the plugin delivers (--complement)".
 * The answer is carried to `add` as `WizardResult.complement`.
 */
export const complementStep: WizardStep<AddWizardState> = {
  id: 'complement',
  shouldShow: hasPluginOverlap,
  async run(s): Promise<StepOutcome> {
    const answer = await select({
      message: 'Some picks are already delivered by an enabled plugin',
      options: [
        { value: 'no', label: 'Install them anyway', hint: '' },
        { value: 'yes', label: 'Skip what the plugin delivers (--complement)', hint: '' },
        BACK_OPTION,
      ],
      initialValue: s.complement === true ? 'yes' : 'no',
    });
    const outcome = resolveOutcome(answer);
    if (outcome) return outcome;

    s.complement = answer === 'yes';
    return 'next';
  },
};
