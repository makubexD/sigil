import { select } from '../../prompts';
import { cancel } from '../../frame';
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
  s.configScope = undefined; // scopes differ per tool, so a stale one could be invalid
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

/** "Which AI tool?" plus what was found in the folder, so the default is never a mystery. One line. */
function targetQuestion(s: AddWizardState): string {
  const found = detectedTargetsIn(s.ctx.projectDir);
  const label = (name: string): string =>
    s.ctx.scaffoldableTargets.find(t => t.name === name)?.displayName ?? name;
  const note =
    found.length > 0
      ? `set up here: ${found.map(label).join(', ')}`
      : `nothing set up in this folder yet, so ${label(s.ctx.detectedTarget)} is preselected`;
  return `Which AI tool is this install for?  (${note})`;
}

/** The tools the question offers: the ones already set up in the folder first. */
function targetOptions(s: AddWizardState) {
  const found = detectedTargetsIn(s.ctx.projectDir);
  const rank = (name: string): number => (found.includes(name) ? 0 : 1);
  return [...s.ctx.scaffoldableTargets]
    .sort((a, b) => rank(a.name) - rank(b.name))
    .map(t => ({
      value: t.name,
      label: t.displayName ?? t.name,
      hint: t.installHint ?? '',
    }));
}

/**
 * Makes `name` the target: drops answers that depended on the previous one, then loads install
 * states. False, after saying why, when the target has nothing to install.
 */
export async function adoptTarget(s: AddWizardState, name: string): Promise<boolean> {
  applyChosenTarget(s, name);
  if (visibleArtifacts(s).length === 0) {
    cancel(`No installable artifacts for target '${s.target}'.`);
    return false;
  }
  await refreshInstallStates(s);
  return true;
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
  /** Skipped when the folder or `--target` already says which tool (`ctx.fixedTarget`). */
  shouldShow: s => s.ctx.fixedTarget === undefined,
  async run(s): Promise<StepOutcome> {
    const answer = await select({
      message: targetQuestion(s),
      options: targetOptions(s),
      initialValue: s.target ?? s.ctx.detectedTarget,
    });
    const outcome = resolveOutcome(answer);
    if (outcome) return outcome;
    return (await adoptTarget(s, answer as string)) ? 'next' : 'cancel';
  },
};
