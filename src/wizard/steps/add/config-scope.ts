import { select, note } from '@clack/prompts';
import { resolveSelection, CONFIG_KINDS } from '../../../select';
import type { ConfigKind, ConfigScopeInfo, ConfigScopeDestination } from '../../../types';
import type { WizardStep, StepOutcome } from '../../engine';
import { chosenTarget, type AddWizardState } from './state';
import { BACK_OPTION, resolveOutcome } from './prompt-helpers';

function resolvedIds(s: AddWizardState): string[] {
  return resolveSelection({
    selectors: s.selectors ?? [],
    filters: { language: s.language },
    catalog: s.ctx.catalog,
    packs: s.ctx.packs,
  }).ids;
}

function hasConfigKind(s: AddWizardState): boolean {
  return resolvedIds(s).some(id => CONFIG_KINDS.has(s.ctx.catalog.byId.get(id)?.kind ?? ''));
}

/** The distinct config kinds (hook/settings/mcp) present in the resolved selection. */
function selectedConfigKinds(s: AddWizardState, allIds: string[]): ConfigKind[] {
  return [
    ...new Set(
      allIds
        .map(id => s.ctx.catalog.byId.get(id)?.kind)
        .filter((k): k is ConfigKind => CONFIG_KINDS.has(k ?? '')),
    ),
  ];
}

/** De-duped `fullPath › section` display strings for a scope's destinations. */
function destinationTargets(destinations: ConfigScopeDestination[]): string[] {
  return [
    ...new Set(destinations.map(d => (d.section ? `${d.fullPath}  › ${d.section}` : d.fullPath))),
  ];
}

function buildScopeOptions(scopeInfos: ConfigScopeInfo[]) {
  return [
    BACK_OPTION,
    ...scopeInfos.map(si => ({
      value: si.value,
      label: `${si.label}   (precedence ${si.precedence})`,
      hint: `${destinationTargets(si.destinations).join('  ·  ')}  — ${si.description}`,
    })),
  ];
}

/** Builds the "writes to every project" warning body for the all-projects blast radius. */
function buildAllProjectsWarning(uniqueTargets: string[], hasSettings: boolean): string {
  return (
    `⚠  This scope writes to:\n` +
    uniqueTargets.map(p => `     ${p}`).join('\n') +
    '\n⚠  These files affect ALL your projects.\n' +
    (hasSettings ? '⚠  settings artifacts at this scope can change AI behaviour globally.\n' : '') +
    'A backup will be saved to <file>.sigil.bak before the first write.\n' +
    'After install, compare the backup against the new file to verify\n' +
    'only your selected artifacts were added.'
  );
}

/** Shows the "writes to every project" warning note when the chosen scope has all-projects blast radius. */
function warnIfAllProjectsScope(
  s: AddWizardState,
  allIds: string[],
  chosenScopeInfo: ConfigScopeInfo | undefined,
): void {
  if (chosenScopeInfo?.blastRadius !== 'all-projects') return;
  const hasSettings = allIds.some(id => s.ctx.catalog.byId.get(id)?.kind === 'settings');
  note(
    buildAllProjectsWarning(destinationTargets(chosenScopeInfo.destinations), hasSettings),
    'Blast-radius warning',
  );
}

/** Config-kind install scope picker (project/local/user) — shown only when a config-kind artifact is selected. */
export const configScopeStep: WizardStep<AddWizardState> = {
  id: 'configScope',
  shouldShow: hasConfigKind,
  async run(s): Promise<StepOutcome> {
    const allIds = resolvedIds(s);
    const ct = chosenTarget(s);
    const scopeInfos = ct?.configScopes?.(selectedConfigKinds(s, allIds), s.ctx.projectDir) ?? [];

    const scopeAnswer = await select({
      message: 'Where should config artifacts (hook/settings/mcp) be installed?',
      options: buildScopeOptions(scopeInfos),
      initialValue: s.configScope ?? 'project',
    });
    const outcome = resolveOutcome(scopeAnswer);
    if (outcome) return outcome;

    s.configScope = scopeAnswer as string;
    const chosenScopeInfo = scopeInfos.find(si => si.value === s.configScope);
    warnIfAllProjectsScope(s, allIds, chosenScopeInfo);

    return 'next';
  },
};
