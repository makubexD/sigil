import { select, isCancel, cancel } from '@clack/prompts';
import type { WizardStep, StepOutcome } from '../../engine';
import { BACK, chosenTarget, type AddWizardState } from './state';
import { packContentHint } from './options';

/** "Which pack?" picker — shown only for the 'pack' (Recommended) scope. */
export const packStep: WizardStep<AddWizardState> = {
  id: 'pack',
  shouldShow: s => s.scope === 'pack',
  async run(s): Promise<StepOutcome> {
    const ct = chosenTarget(s);
    const opts = [
      { value: BACK, label: '← Back', hint: '' },
      ...s.ctx.packs.map(p => ({
        value: `pack:${p.name}`,
        label: p.displayName,
        hint: packContentHint(p, s.ctx.catalog, s.ctx.packs, ct),
      })),
    ];
    const answer = await select({
      message: 'Which pack?',
      options: opts,
      initialValue: s.selectors?.[0],
    });
    if (isCancel(answer)) {
      cancel('Install cancelled.');
      return 'cancel';
    }
    if (answer === BACK) return 'back';

    s.selectors = [answer as string];
    return 'next';
  },
};
