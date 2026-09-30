import { multiselect, note, isCancel, cancel } from '@clack/prompts';
import { kindSupportingTargets, setPlatforms } from '../../../authoring/platforms';
import type { WizardStep, StepOutcome } from '../../engine';
import { BACK, type NewWizardState } from './state';
import { TARGET_META } from '../../types';

/** Platform-targeting picker — auto-skipped when only one target supports the chosen kind. */
export const platformsStep: WizardStep<NewWizardState> = {
  id: 'platforms',
  shouldShow: s => kindSupportingTargets(s.kind!, s.ctx.targets).length > 1,
  async run(s): Promise<StepOutcome> {
    const supporting = kindSupportingTargets(s.kind!, s.ctx.targets);
    note(
      'By default, this artifact propagates to EVERY AI that supports its kind (DRY rule).\n' +
        'Deselect AIs to restrict. You can always widen later with:\n' +
        '  sigil retarget <id> --add <platform>',
      'Platform targeting',
    );
    const platformOpts = [
      { value: BACK, label: '← Back', hint: 'return to kind selection' },
      ...supporting.map(t => ({
        value: t.name,
        label: TARGET_META[t.name]?.label ?? t.name,
        hint: TARGET_META[t.name]?.hint ?? '',
      })),
    ];
    const pickedPlatforms = await multiselect({
      message: 'Which AIs should this artifact propagate to?  (include "← Back" to return)',
      options: platformOpts,
      initialValues: s.platforms ?? [],
      required: false,
    });
    if (isCancel(pickedPlatforms)) {
      cancel('Scaffold cancelled.');
      return 'cancel';
    }
    const arr = pickedPlatforms as string[];
    if (arr.includes(BACK) || arr.length === 0) return 'back';

    const { platforms: normalized } = setPlatforms(
      s.kind!,
      arr.filter(v => v !== BACK),
      s.ctx.targets,
    );
    s.platforms = normalized;
    return 'next';
  },
};
