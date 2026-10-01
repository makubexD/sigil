import { select, confirm, isCancel, cancel } from '@clack/prompts';
import type { WizardStep, StepOutcome } from '../../engine';
import { visibleArtifacts, type AddWizardState, type ScopeChoice } from './state';
import { BACK_OPTION, CANCEL_MESSAGE, resolveOutcome } from './prompt-helpers';

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

/** Builds the top-level scope menu: the careful choices first, the whole catalog last. */
function buildScopeOptions(s: AddWizardState): ScopeOption[] {
  const totalCount = visibleArtifacts(s).length;
  return [
    BACK_OPTION,
    { value: 'browse', label: 'Pick specific items', hint: 'choose by type, or mix across types' },
    ...packOption(s),
    {
      value: 'all',
      label: 'Everything',
      hint: `the whole catalog — ${totalCount} artifact${totalCount !== 1 ? 's' : ''}, asks to confirm`,
    },
  ];
}

/** Records the scope. Changing it drops answers that only made sense for the previous one. */
function applyScope(s: AddWizardState, scope: ScopeChoice): void {
  const changed = s.scope !== undefined && s.scope !== scope;
  s.scope = scope;
  if (changed) {
    s.language = undefined;
    s.selectors = undefined;
    s.kindPick = undefined;
    s.browseAll = undefined;
  }
  // 'all' has no further narrowing step of its own (unlike pack/browse, which set
  // s.selectors from their own picker) — the selection IS "everything" already.
  if (scope === 'all') s.selectors = ['all'];
}

/** Installing the whole catalog is rarely what a first-timer means; make them say so. */
async function confirmEverything(s: AddWizardState): Promise<boolean | 'cancel'> {
  const count = visibleArtifacts(s).length;
  const go = await confirm({
    message:
      `Install all ${count} artifacts into ${s.ctx.projectDir}? ` +
      'That includes hooks and MCP servers, which run commands and connect to services.',
    initialValue: false,
  });
  return isCancel(go) ? 'cancel' : go;
}

/** Asks the scope question; `outcome` is set for Back / Ctrl+C. */
async function askScope(s: AddWizardState): Promise<{ outcome?: StepOutcome; answer?: string }> {
  const answer = await select({
    message: 'What would you like to install?',
    options: buildScopeOptions(s),
    initialValue: s.scope ?? 'browse',
  });
  const outcome = resolveOutcome(answer);
  return outcome ? { outcome } : { answer: answer as string };
}

/** Top-level "What would you like to install?" menu — Pick specific / Recommended / Everything. */
export const scopeStep: WizardStep<AddWizardState> = {
  id: 'scope',
  async run(s): Promise<StepOutcome> {
    for (;;) {
      const { outcome, answer } = await askScope(s);
      if (outcome) return outcome;
      if (answer !== 'all') {
        applyScope(s, answer as ScopeChoice);
        return 'next';
      }
      const sure = await confirmEverything(s);
      if (sure === 'cancel') {
        cancel(CANCEL_MESSAGE);
        return 'cancel';
      }
      if (sure) {
        applyScope(s, 'all');
        return 'next';
      }
    }
  },
};
