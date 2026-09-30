import { select, note, isCancel, cancel } from '@clack/prompts';
import { resolveSelection, CONFIG_KINDS } from '../../../select';
import type { ConfigKind } from '../../../types';
import type { WizardStep, StepOutcome } from '../../engine';
import { BACK, chosenTarget, type AddWizardState } from './state';

function resolvedIds(s: AddWizardState): string[] {
  return resolveSelection(
    s.selectors ?? [],
    { language: s.language },
    s.ctx.catalog,
    s.ctx.packs,
    [],
  ).ids;
}

function hasConfigKind(s: AddWizardState): boolean {
  return resolvedIds(s).some(id => CONFIG_KINDS.has(s.ctx.catalog.byId.get(id)?.kind ?? ''));
}

/** Config-kind install scope picker (project/local/user) — shown only when a config-kind artifact is selected. */
export const configScopeStep: WizardStep<AddWizardState> = {
  id: 'configScope',
  shouldShow: hasConfigKind,
  async run(s): Promise<StepOutcome> {
    const allIds = resolvedIds(s);
    const ct = chosenTarget(s);
    const selectedConfigKinds = [
      ...new Set(
        allIds
          .map(id => s.ctx.catalog.byId.get(id)?.kind)
          .filter((k): k is ConfigKind => CONFIG_KINDS.has(k ?? '')),
      ),
    ];

    const scopeInfos = ct?.configScopes?.(selectedConfigKinds, s.ctx.projectDir) ?? [];
    const scopeOptions = [
      { value: BACK, label: '← Back', hint: '' },
      ...scopeInfos.map(si => {
        const targets = [
          ...new Set(
            si.destinations.map(d => (d.section ? `${d.fullPath}  › ${d.section}` : d.fullPath)),
          ),
        ];
        return {
          value: si.value,
          label: `${si.label}   (precedence ${si.precedence})`,
          hint: `${targets.join('  ·  ')}  — ${si.description}`,
        };
      }),
    ];

    const scopeAnswer = await select({
      message: 'Where should config artifacts (hook/settings/mcp) be installed?',
      options: scopeOptions,
      initialValue: s.configScope ?? 'project',
    });
    if (isCancel(scopeAnswer)) {
      cancel('Install cancelled.');
      return 'cancel';
    }
    if (scopeAnswer === BACK) return 'back';

    s.configScope = scopeAnswer as string;

    const chosenScopeInfo = scopeInfos.find(si => si.value === s.configScope);
    if (chosenScopeInfo?.blastRadius === 'all-projects') {
      const uniqueTargets = [
        ...new Set(
          chosenScopeInfo.destinations.map(d =>
            d.section ? `${d.fullPath}  › ${d.section}` : d.fullPath,
          ),
        ),
      ];
      const hasSettings = allIds.some(id => s.ctx.catalog.byId.get(id)?.kind === 'settings');
      note(
        `⚠  This scope writes to:\n` +
          uniqueTargets.map(p => `     ${p}`).join('\n') +
          '\n⚠  These files affect ALL your projects.\n' +
          (hasSettings
            ? '⚠  settings artifacts at this scope can change AI behaviour globally.\n'
            : '') +
          'A backup will be saved to <file>.sigil.bak before the first write.\n' +
          'After install, compare the backup against the new file to verify\n' +
          'only your selected artifacts were added.',
        'Blast-radius warning',
      );
    }

    return 'next';
  },
};
