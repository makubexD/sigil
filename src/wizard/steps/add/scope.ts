import { select, isCancel, cancel } from '@clack/prompts';
import type { WizardStep, StepOutcome } from '../../engine';
import { BACK, visibleArtifacts, type AddWizardState, type ScopeChoice } from './state';

/** Top-level "What would you like to install?" menu — Everything / Recommended / Pick specific. */
export const scopeStep: WizardStep<AddWizardState> = {
  id: 'scope',
  async run(s): Promise<StepOutcome> {
    const totalCount = visibleArtifacts(s).length;
    const scopeOpts = [
      { value: BACK, label: '← Back', hint: '' },
      {
        value: 'all',
        label: 'Everything',
        hint: `full catalog — ${totalCount} artifact${totalCount !== 1 ? 's' : ''}`,
      },
      ...(s.ctx.packs.length > 0
        ? [
            {
              value: 'pack',
              label: 'Recommended',
              hint: 'curated bundles — mix of tools, skills & settings',
            },
          ]
        : []),
      {
        value: 'browse',
        label: 'Pick specific items',
        hint: 'choose by type, or mix across types',
      },
    ];
    const answer = await select({
      message: 'What would you like to install?',
      options: scopeOpts,
      initialValue: s.scope ?? 'all',
    });
    if (isCancel(answer)) {
      cancel('Install cancelled.');
      return 'cancel';
    }
    if (answer === BACK) return 'back';

    s.scope = answer as ScopeChoice;
    // 'all' has no further narrowing step of its own (unlike pack/browse, which set
    // s.selectors from their own picker) — the selection IS "everything" already.
    if (s.scope === 'all') s.selectors = ['all'];
    return 'next';
  },
};
