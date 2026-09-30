import { select } from '@clack/prompts';
import { availableKinds, kindPlural, kindHint } from '../../../select';
import type { ArtifactKind } from '../../../types';
import type { WizardStep, StepOutcome } from '../../engine';
import { chosenTarget, visibleArtifacts, type AddWizardState } from './state';
import { BACK_OPTION, resolveOutcome } from './prompt-helpers';

const ALL_TYPES = '__all__';

/** Builds the kind sub-menu options: "All types" plus one entry per present kind. */
function buildKindOptions(s: AddWizardState) {
  const visible = visibleArtifacts(s);
  const ct = chosenTarget(s);
  return [
    BACK_OPTION,
    { value: ALL_TYPES, label: 'All types (mix anything)', hint: 'pick across kinds in one list' },
    ...availableKinds(visible).map(k => {
      const count = visible.filter(a => a.kind === k).length;
      return { value: k, label: kindPlural(ct, k), hint: `${count} · ${kindHint(ct, k) ?? ''}` };
    }),
  ];
}

/** Kind sub-menu shown under "Pick specific items" — "All types" or a specific kind. */
export const browseKindStep: WizardStep<AddWizardState> = {
  id: 'browseKind',
  shouldShow: s => s.scope === 'browse',
  async run(s): Promise<StepOutcome> {
    const answer = await select({
      message: 'Browse & pick',
      options: buildKindOptions(s),
      initialValue: s.browseAll ? ALL_TYPES : (s.kindPick ?? ALL_TYPES),
    });
    const outcome = resolveOutcome(answer);
    if (outcome) return outcome;

    if (answer === ALL_TYPES) {
      s.browseAll = true;
      s.kindPick = undefined;
    } else {
      s.browseAll = false;
      s.kindPick = answer as ArtifactKind;
    }
    return 'next';
  },
};
