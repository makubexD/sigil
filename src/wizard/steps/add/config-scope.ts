import { select, note } from '../../prompts';
import { CONFIG_KINDS } from '../../../select';
import { isHomeScopedRoot } from '../../../config-utils';
import type { ConfigKind, ConfigScopeInfo, ConfigScopeDestination } from '../../../types';
import type { WizardStep, StepOutcome } from '../../engine';
import { chosenTarget, type AddWizardState } from './state';
import { previewSelection } from './plan-preview';
import { BACK_OPTION, resolveOutcome } from './prompt-helpers';

function resolvedIds(s: AddWizardState): string[] {
  return previewSelection(s).ids;
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

/** Plain-language names for the scopes; the technical value stays in the equivalent command. */
const PLAIN_LABELS: Record<string, string> = {
  project: 'This project, shared with your team (recommended)',
  local: 'This project, just me (not shared)',
  user: 'All my projects (your home folder)',
};

/** True when this scope writes a file in the home folder, even if only this project's part of it. */
const touchesHome = (si: ConfigScopeInfo): boolean =>
  si.destinations.some(d => isHomeScopedRoot(d.root));

/** The recommended scope first, then the rest in the target's own order. */
const projectFirst = (infos: ConfigScopeInfo[]): ConfigScopeInfo[] => [
  ...infos.filter(si => si.value === 'project'),
  ...infos.filter(si => si.value !== 'project'),
];

function buildScopeOptions(scopeInfos: ConfigScopeInfo[]) {
  return [
    BACK_OPTION,
    ...projectFirst(scopeInfos).map(si => ({
      value: si.value,
      label: PLAIN_LABELS[si.value] ?? si.label,
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

/** The note for a scope that stays inside this project but is stored in a home-folder file. */
function buildHomeFileNote(uniqueTargets: string[]): string {
  return (
    'This scope is only for this project, but it is stored in a file in your home folder:\n' +
    uniqueTargets.map(p => `     ${p}`).join('\n') +
    "\nsigil only adds this project's part. A backup is saved to <file>.sigil.bak before the first write."
  );
}

/** Warns when the chosen scope writes outside the project: loudly for every project, quietly for a home file. */
function warnIfOutsideProject(
  s: AddWizardState,
  allIds: string[],
  chosenScopeInfo: ConfigScopeInfo | undefined,
): void {
  if (!chosenScopeInfo) return;
  const targets = destinationTargets(chosenScopeInfo.destinations);
  if (chosenScopeInfo.blastRadius === 'all-projects') {
    const hasSettings = allIds.some(id => s.ctx.catalog.byId.get(id)?.kind === 'settings');
    note(buildAllProjectsWarning(targets, hasSettings), 'Blast-radius warning');
  } else if (touchesHome(chosenScopeInfo)) {
    note(buildHomeFileNote(targets), 'Heads up');
  }
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
      message: 'Where should the MCP servers, hooks and settings be saved?',
      options: buildScopeOptions(scopeInfos),
      initialValue: s.configScope ?? 'project',
    });
    const outcome = resolveOutcome(scopeAnswer);
    if (outcome) return outcome;

    s.configScope = scopeAnswer as string;
    const chosenScopeInfo = scopeInfos.find(si => si.value === s.configScope);
    warnIfOutsideProject(s, allIds, chosenScopeInfo);

    return 'next';
  },
};
