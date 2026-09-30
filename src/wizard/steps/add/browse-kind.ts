import { select, isCancel, cancel } from '@clack/prompts';
import { availableKinds, kindPlural, kindHint } from '../../../select';
import type { ArtifactKind } from '../../../types';
import type { WizardStep, StepOutcome } from '../../engine';
import { BACK, chosenTarget, visibleArtifacts, type AddWizardState } from './state';

const ALL_TYPES = '__all__';

/** Kind sub-menu shown under "Pick specific items" — "All types" or a specific kind. */
export const browseKindStep: WizardStep<AddWizardState> = {
  id: 'browseKind',
  shouldShow: s => s.scope === 'browse',
  async run(s): Promise<StepOutcome> {
    const visible = visibleArtifacts(s);
    const ct = chosenTarget(s);
    const presentKinds = availableKinds(visible);
    const kindOpts = [
      { value: BACK, label: '← Back', hint: '' },
      {
        value: ALL_TYPES,
        label: 'All types (mix anything)',
        hint: 'pick across kinds in one list',
      },
      ...presentKinds.map(k => {
        const count = visible.filter(a => a.kind === k).length;
        return {
          value: k,
          label: kindPlural(ct, k),
          hint: `${count} · ${kindHint(ct, k) ?? ''}`,
        };
      }),
    ];
    const answer = await select({
      message: 'Browse & pick',
      options: kindOpts,
      initialValue: s.browseAll ? ALL_TYPES : (s.kindPick ?? ALL_TYPES),
    });
    if (isCancel(answer)) {
      cancel('Install cancelled.');
      return 'cancel';
    }
    if (answer === BACK) return 'back';

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
