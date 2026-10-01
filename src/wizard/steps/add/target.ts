import { select, cancel } from '@clack/prompts';
import { computeInstallStates } from '../../../install-state';
import { detectedTargetsIn } from '../../../project-context';
import type { WizardStep, StepOutcome } from '../../engine';
import { visibleArtifacts, chosenTarget, type AddWizardState } from './state';
import { resolveOutcome } from './prompt-helpers';

/** Clears downstream answers that depend on the chosen target, on target change. */
function resetAfterTarget(s: AddWizardState): void {
  s.selectors = undefined;
  s.language = undefined;
  s.kindPick = undefined;
  s.browseAll = undefined;
}

/** Recomputes install states for the chosen target's visible artifacts, if not already cached. */
async function refreshInstallStates(s: AddWizardState): Promise<void> {
  if (s.installStatesForTarget === s.target) return;
  const ct = chosenTarget(s);
  const targetName = s.target;
  if (!ct || !targetName) return;

  try {
    s.installStates = await computeInstallStates({
      candidateIds: visibleArtifacts(s).map(a => a.id),
      target: ct,
      catalog: s.ctx.catalog,
      projectDir: s.ctx.projectDir,
    });
  } catch {
    // State detection failed — proceed without annotations (all items appear as 'new').
    s.installStates = new Map();
  }
  s.installStatesForTarget = targetName;
}

/** "Which AI tool?" plus what was found in the folder, so the default is never a mystery. */
function targetQuestion(s: AddWizardState): string {
  const found = detectedTargetsIn(s.ctx.projectDir);
  const label = (name: string): string =>
    s.ctx.scaffoldableTargets.find(t => t.name === name)?.displayName ?? name;
  const note =
    found.length > 0
      ? `found: ${found.map(label).join(', ')}`
      : `nothing set up in this folder yet, so ${label(s.ctx.detectedTarget)} is preselected`;
  return `Which AI tool is this project for?  (${note})`;
}

/** Applies the chosen target to state, resetting downstream answers if it changed. */
function applyChosenTarget(s: AddWizardState, answer: string): void {
  const changed = s.target !== undefined && s.target !== answer;
  s.target = answer;
  if (changed) resetAfterTarget(s);
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
    const answer = await select({
      message: targetQuestion(s),
      options: s.ctx.scaffoldableTargets.map(t => ({
        value: t.name,
        label: t.displayName ?? t.name,
        hint: t.installHint ?? '',
      })),
      initialValue: s.target ?? s.ctx.detectedTarget,
    });
    const outcome = resolveOutcome(answer);
    if (outcome) return outcome;

    applyChosenTarget(s, answer as string);

    if (visibleArtifacts(s).length === 0) {
      cancel(`No installable artifacts for target '${s.target}'.`);
      return 'cancel';
    }

    await refreshInstallStates(s);
    return 'next';
  },
};
