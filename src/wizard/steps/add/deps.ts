import { select, note, isCancel, cancel } from '@clack/prompts';
import { resolveSelection, computeClosure, kindNoun, type ClosurePreview } from '../../../select';
import { hasUsesClosure } from '../../../kinds';
import type { WizardStep, StepOutcome } from '../../engine';
import { BACK, chosenTarget, type AddWizardState } from './state';

/** True when at least one resolved id belongs to a kind with a `uses:` dependency closure. */
function selectionHasClosure(s: AddWizardState): boolean {
  const { ids } = resolveSelection(
    s.selectors ?? [],
    { language: s.language },
    s.ctx.catalog,
    s.ctx.packs,
    [],
  );
  return ids.some(id => hasUsesClosure(s.ctx.catalog.byId.get(id)?.kind ?? ''));
}

/**
 * "Include dependencies?" prompt. Skipped when the selection has no `uses:` closure
 * at all (e.g. a config-kind-only pick) — showing this prompt in that case is a
 * no-op (nothing to include either way), which the pre-registry wizard used to do.
 * `s.includeDeps` defaults to `true` (set before the wizard runs) so a skip here
 * behaves the same as answering "Yes".
 */
export const depsStep: WizardStep<AddWizardState> = {
  id: 'deps',
  shouldShow: selectionHasClosure,
  async run(s): Promise<StepOutcome> {
    const ct = chosenTarget(s);
    const { ids: primaryIds } = resolveSelection(
      s.selectors!,
      { language: s.language },
      s.ctx.catalog,
      s.ctx.packs,
      [],
    );
    const cp: ClosurePreview = computeClosure(primaryIds, s.ctx.catalog);

    let depBody: string;
    if (cp.dependencies.length > 0) {
      const lines = cp.dependencies.map(({ artifact: a, via }) => {
        const title = (a.frontmatter.title as string | undefined) ?? a.id;
        const viaDisplay = via.length <= 2 ? via.join(', ') : `${via[0]} +${via.length - 1} more`;
        return `  ${kindNoun(ct, a.kind).padEnd(12)}  ${a.id}  — ${title}  (via ${viaDisplay})`;
      });
      depBody =
        'The skill author recommends installing these alongside it\n' +
        "(declared in the skill's `uses:` frontmatter — not a hard requirement):\n" +
        lines.join('\n') +
        '\n\nYes installs these too. No installs only your selection (--no-deps).';
    } else {
      depBody =
        'Your current selection has no uses: dependencies — only your selected artifacts will be written.';
    }
    note(depBody, 'About dependencies');

    const answer = await select({
      message: 'Include dependencies?',
      options: [
        { value: 'yes', label: 'Yes', hint: 'install skills + their dependency closure' },
        { value: 'no', label: 'No', hint: 'install selected only (--no-deps)' },
        { value: BACK, label: '← Back', hint: '' },
      ],
      initialValue: s.includeDeps === false ? 'no' : 'yes',
    });
    if (isCancel(answer)) {
      cancel('Install cancelled.');
      return 'cancel';
    }
    if (answer === BACK) return 'back';

    s.includeDeps = answer === 'yes';
    return 'next';
  },
};
