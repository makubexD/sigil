import { multiselect, note, isCancel } from '@clack/prompts';
import { cancel } from '../../frame';
import { kindSupportingTargets, setPlatforms } from '../../../authoring/platforms';
import type { WizardStep, StepOutcome } from '../../engine';
import { BACK, type NewWizardState } from './state';

function showPlatformsNote(): void {
  note(
    'By default, this artifact propagates to EVERY AI that supports its kind (DRY rule).\n' +
      'Deselect AIs to restrict. You can always widen later with:\n' +
      '  sigil retarget <id> --add <platform>',
    'Platform targeting',
  );
}

/** Normalizes the picked platform array (stripping BACK) via setPlatforms. */
function normalizePicked(s: NewWizardState, arr: string[]): string[] | undefined {
  return setPlatforms(
    s.kind!,
    arr.filter(v => v !== BACK),
    s.ctx.targets,
  ).platforms;
}

function buildPlatformOptions(s: NewWizardState) {
  return [
    { value: BACK, label: '← Back', hint: 'return to kind selection' },
    ...kindSupportingTargets(s.kind!, s.ctx.targets).map(t => ({
      value: t.name,
      label: t.displayName ?? t.name,
      hint: t.installHint ?? '',
    })),
  ];
}

/** Platform-targeting picker — auto-skipped when only one target supports the chosen kind. */
export const platformsStep: WizardStep<NewWizardState> = {
  id: 'platforms',
  shouldShow: s => kindSupportingTargets(s.kind!, s.ctx.targets).length > 1,
  async run(s): Promise<StepOutcome> {
    showPlatformsNote();
    const picked = await multiselect({
      message: 'Which AIs should this artifact propagate to?  (include "← Back" to return)',
      options: buildPlatformOptions(s),
      initialValues: s.platforms ?? [],
      required: false,
    });
    if (isCancel(picked)) {
      cancel('Scaffold cancelled.');
      return 'cancel';
    }
    const arr = picked as string[];
    if (arr.includes(BACK) || arr.length === 0) return 'back';
    s.platforms = normalizePicked(s, arr);
    return 'next';
  },
};
