import { select, isCancel, cancel } from '@clack/prompts';
import { computeInstallStates } from '../../../install-state';
import type { WizardStep, StepOutcome } from '../../engine';
import { visibleArtifacts, chosenTarget, type AddWizardState } from './state';
import { TARGET_META } from '../../types';

/** Clears downstream answers that depend on the chosen target, on target change. */
function resetAfterTarget(s: AddWizardState): void {
  s.selectors = undefined;
  s.language = undefined;
  s.kindPick = undefined;
  s.browseAll = undefined;
}

/**
 * First step: pick the install target (claude/copilot). No "← Back" — it's the
 * first step in the wizard. Computes install states for the chosen target's
 * visible artifacts once, invalidating/recomputing whenever the target changes
 * (including via back-navigation into this step).
 */
export const targetStep: WizardStep<AddWizardState> = {
  id: 'target',
  async run(s): Promise<StepOutcome> {
    const targetOptions = s.ctx.scaffoldableTargets.map(t => ({
      value: t.name,
      label: TARGET_META[t.name]?.label ?? t.name,
      hint: TARGET_META[t.name]?.hint ?? '',
    }));
    const answer = await select({
      message: `Install target  (detected: ${s.ctx.detectedTarget})`,
      options: targetOptions,
      initialValue: s.target ?? s.ctx.detectedTarget,
    });
    if (isCancel(answer)) {
      cancel('Install cancelled.');
      return 'cancel';
    }

    const changed = s.target !== undefined && s.target !== answer;
    s.target = answer as string;
    if (changed) resetAfterTarget(s);

    if (visibleArtifacts(s).length === 0) {
      cancel(`No installable artifacts for target '${s.target}'.`);
      return 'cancel';
    }

    if (s.installStatesForTarget !== s.target) {
      const ct = chosenTarget(s);
      if (ct) {
        try {
          s.installStates = await computeInstallStates(
            visibleArtifacts(s).map(a => a.id),
            ct,
            s.ctx.catalog,
            s.ctx.projectDir,
          );
        } catch {
          // State detection failed — proceed without annotations (all items appear as 'new').
          s.installStates = new Map();
        }
        s.installStatesForTarget = s.target;
      }
    }

    return 'next';
  },
};
