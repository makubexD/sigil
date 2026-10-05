import { select, note } from '../../prompts';
import { computeClosure, kindNoun, type ClosurePreview } from '../../../select';
import { hasUsesClosure } from '../../../kinds';
import type { WizardStep, StepOutcome } from '../../engine';
import { chosenTarget, type AddWizardState } from './state';
import { previewSelection } from './plan-preview';
import { BACK_OPTION, resolveOutcome } from './prompt-helpers';
import { CLI_LABEL_COL_WIDTH } from '../../../cli-helpers';

/** Above this many co-installing skills, the `via` hint is truncated to "first +N more". */
const VIA_INLINE_LIMIT = 2;

/** True when at least one resolved id belongs to a kind with a `uses:` dependency closure. */
function selectionHasClosure(s: AddWizardState): boolean {
  const { ids } = previewSelection(s);
  if (!ids.some(id => hasUsesClosure(s.ctx.catalog.byId.get(id)?.kind ?? ''))) return false;
  // Nothing to ask when every helper is carried inside the skill for this tool.
  return computeClosure(ids, s.ctx.catalog, chosenTarget(s)).dependencies.length > 0;
}

/** Renders one dependency line: `<kind>  <id>  — <title>  (via <skill(s)>)`. */
function renderDepLine(
  ct: ReturnType<typeof chosenTarget>,
  dep: ClosurePreview['dependencies'][number],
): string {
  const { artifact: a, via } = dep;
  const title = (a.frontmatter.title as string | undefined) ?? a.id;
  const viaDisplay =
    via.length <= VIA_INLINE_LIMIT ? via.join(', ') : `${via[0]} +${via.length - 1} more`;
  return `  ${kindNoun(ct, a.kind).padEnd(CLI_LABEL_COL_WIDTH)}  ${a.id}  — ${title}  (via ${viaDisplay})`;
}

/** Builds the "About dependencies" note body for the given closure preview. */
function buildDepsNoteBody(ct: ReturnType<typeof chosenTarget>, cp: ClosurePreview): string {
  if (cp.dependencies.length === 0) {
    return 'Nothing else is needed: only the items you picked will be written.';
  }
  const lines = cp.dependencies.map(dep => renderDepLine(ct, dep));
  return (
    'These skills work best together with these helpers (rules and agents they refer to):\n' +
    lines.join('\n') +
    '\n\nYes installs the helpers too (recommended). No installs only what you picked;\n' +
    'the skill still works, but may mention helpers that are not there. (--no-deps)'
  );
}

/** Computes the closure preview and shows the "About dependencies" note for it. */
function showDepsNote(s: AddWizardState): void {
  const ct = chosenTarget(s);
  const cp: ClosurePreview = computeClosure(previewSelection(s).ids, s.ctx.catalog, ct);
  note(buildDepsNoteBody(ct, cp), 'About dependencies');
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
    showDepsNote(s);

    const answer = await select({
      message: 'Install these helpers too?',
      options: [
        { value: 'yes', label: 'Yes (recommended)', hint: 'what the skill author suggests' },
        { value: 'no', label: 'No', hint: 'only the items I picked' },
        BACK_OPTION,
      ],
      initialValue: s.includeDeps === false ? 'no' : 'yes',
    });
    const outcome = resolveOutcome(answer);
    if (outcome) return outcome;

    s.includeDeps = answer === 'yes';
    return 'next';
  },
};
