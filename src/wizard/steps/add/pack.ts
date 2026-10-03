import { select } from '../../prompts';
import type { WizardStep, StepOutcome } from '../../engine';
import { chosenTarget, type AddWizardState } from './state';
import { packContentHint } from './options';
import { BACK_OPTION, resolveOutcome } from './prompt-helpers';

/** "Which pack?" picker — shown only for the 'pack' (Recommended) scope. */
export const packStep: WizardStep<AddWizardState> = {
  id: 'pack',
  shouldShow: s => s.scope === 'pack',
  async run(s): Promise<StepOutcome> {
    const ct = chosenTarget(s);
    const opts = [
      BACK_OPTION,
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
    const outcome = resolveOutcome(answer);
    if (outcome) return outcome;

    s.selectors = [answer as string];
    return 'next';
  },
};
