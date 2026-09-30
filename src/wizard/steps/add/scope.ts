import { select } from '@clack/prompts';
import type { WizardStep, StepOutcome } from '../../engine';
import { visibleArtifacts, type AddWizardState, type ScopeChoice } from './state';
import { BACK_OPTION, resolveOutcome } from './prompt-helpers';

type ScopeOption = { value: string; label: string; hint: string };

/** The "Recommended" (pack) entry — only shown when curated packs exist. */
function packOption(s: AddWizardState): ScopeOption[] {
  if (s.ctx.packs.length === 0) return [];
  return [
    {
      value: 'pack',
      label: 'Recommended',
      hint: 'curated bundles — mix of tools, skills & settings',
    },
  ];
}

/** Builds the top-level scope menu options (Everything / Recommended / Pick specific). */
function buildScopeOptions(s: AddWizardState): ScopeOption[] {
  const totalCount = visibleArtifacts(s).length;
  return [
    BACK_OPTION,
    {
      value: 'all',
      label: 'Everything',
      hint: `full catalog — ${totalCount} artifact${totalCount !== 1 ? 's' : ''}`,
    },
    ...packOption(s),
    { value: 'browse', label: 'Pick specific items', hint: 'choose by type, or mix across types' },
  ];
}

/** Top-level "What would you like to install?" menu — Everything / Recommended / Pick specific. */
export const scopeStep: WizardStep<AddWizardState> = {
  id: 'scope',
  async run(s): Promise<StepOutcome> {
    const answer = await select({
      message: 'What would you like to install?',
      options: buildScopeOptions(s),
      initialValue: s.scope ?? 'all',
    });
    const outcome = resolveOutcome(answer);
    if (outcome) return outcome;

    s.scope = answer as ScopeChoice;
    // 'all' has no further narrowing step of its own (unlike pack/browse, which set
    // s.selectors from their own picker) — the selection IS "everything" already.
    if (s.scope === 'all') s.selectors = ['all'];
    return 'next';
  },
};
