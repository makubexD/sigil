import { select } from '../../prompts';
import { outro, cancel } from '../../frame';
import { computeClosure } from '../../../select';
import type { WizardStep, StepOutcome } from '../../engine';
import { BACK, chosenTarget, type AddWizardState } from './state';
import { CANCEL_MESSAGE, resolveOutcome } from './prompt-helpers';
import { previewSelection, upToDateIds } from './plan-preview';
import { showPlanBox } from './plan-box';
import type { PlanView } from './plan-box';

/** Everything the plan box needs, resolved the way the real install resolves it. */
function buildPlanView(s: AddWizardState): PlanView {
  const selection = previewSelection(s);
  const closure = computeClosure(selection.ids, s.ctx.catalog, chosenTarget(s));
  const ids = [
    ...closure.primary.map(a => a.id),
    ...(s.includeDeps ? closure.dependencies.map(d => d.artifact.id) : []),
  ];
  const upToDate = new Set(s.overwrite ? [] : upToDateIds(s, ids));
  return { closure, skipped: selection.skipped, upToDate, writeCount: ids.length - upToDate.size };
}

/** Prompts "Ready to install?" (no "Proceed" when there is nothing to write) and maps the answer. */
async function promptReadyToInstall(canProceed: boolean): Promise<StepOutcome> {
  const answer = await select({
    message: canProceed ? 'Ready to install?' : 'Nothing to install. What now?',
    options: [
      ...(canProceed ? [{ value: 'proceed', label: 'Proceed with install', hint: '' }] : []),
      { value: BACK, label: '← Back', hint: 'change your picks or answers' },
      { value: 'cancel', label: 'Cancel', hint: 'leave without installing' },
    ],
  });
  const outcome = resolveOutcome(answer);
  if (outcome) return outcome;
  if (answer === 'cancel') {
    cancel(CANCEL_MESSAGE);
    return 'cancel';
  }
  outro('Running install…');
  return 'next';
}

/** Final summary + confirm step. Returning 'next' past this ends the wizard successfully. */
export const proceedStep: WizardStep<AddWizardState> = {
  id: 'proceed',
  async run(s): Promise<StepOutcome> {
    const view = buildPlanView(s);
    showPlanBox(s, view);
    return promptReadyToInstall(view.writeCount > 0);
  },
};
