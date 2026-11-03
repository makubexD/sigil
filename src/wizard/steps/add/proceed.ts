import { select } from '../../prompts';
import { outro, cancel } from '../../frame';
import { computeClosure } from '../../../select';
import type { ClosurePreview, SkippedArtifact } from '../../../select';
import type { WizardStep, StepOutcome } from '../../engine';
import { pluginLabel, type PluginOverlap } from '../../../plugin-overlap';
import { BACK, chosenTarget, type AddWizardState } from './state';
import { CANCEL_MESSAGE, resolveOutcome } from './prompt-helpers';
import { previewSelection, previewPluginOverlaps, upToDateIds } from './plan-preview';
import { showPlanBox } from './plan-box';
import type { PlanView } from './plan-box';

/** The previewed selection, its dependency closure, and the ids the plan would write. */
export interface PlanSelection {
  closure: ClosurePreview;
  ids: string[];
  skipped: SkippedArtifact[];
}

/** The closure and ids the plan covers: the picks, plus their helpers when those are included. */
export function planSelection(s: AddWizardState): PlanSelection {
  const selection = previewSelection(s);
  const closure = computeClosure(selection.ids, s.ctx.catalog, chosenTarget(s));
  const ids = [
    ...closure.primary.map(a => a.id),
    ...(s.includeDeps ? closure.dependencies.map(d => d.artifact.id) : []),
  ];
  return { closure, ids, skipped: selection.skipped };
}

/** One `plugin` skip per overlapping id, sorted, in the same words `sigil add` uses. */
function pluginSkips(
  s: AddWizardState,
  overlaps: ReadonlyMap<string, PluginOverlap>,
): SkippedArtifact[] {
  return [...overlaps.keys()].sort().flatMap(id => {
    const overlap = overlaps.get(id);
    if (overlap === undefined) return [];
    return [
      {
        id,
        kind: s.ctx.catalog.byId.get(id)?.kind ?? '',
        cause: 'plugin',
        reason: `delivered by plugin ${pluginLabel(overlap)} (${overlap.source})`,
      },
    ];
  });
}

/** Everything the plan box needs, resolved the way the real install resolves it. */
function buildPlanView(s: AddWizardState): PlanView {
  const { closure, ids, skipped } = planSelection(s);
  const upToDate = new Set(s.overwrite ? [] : upToDateIds(s, ids));
  const overlaps = previewPluginOverlaps(s, ids);
  const delivered = s.complement ? new Set(overlaps.keys()) : new Set<string>();
  return {
    closure,
    skipped: s.complement ? [...skipped, ...pluginSkips(s, overlaps)] : skipped,
    upToDate,
    writeCount: ids.filter(id => !upToDate.has(id) && !delivered.has(id)).length,
    pluginOverlaps: s.complement ? new Map<string, PluginOverlap>() : overlaps,
  };
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
