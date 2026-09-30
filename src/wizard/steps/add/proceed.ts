import { select, note, outro, cancel } from '@clack/prompts';
import {
  resolveSelection,
  computeClosure,
  kindNoun,
  CONFIG_KINDS,
  type ClosurePreview,
} from '../../../select';
import type { ConfigKind } from '../../../types';
import type { WizardStep, StepOutcome } from '../../engine';
import { BACK, chosenTarget, type AddWizardState } from './state';
import { CANCEL_MESSAGE, resolveOutcome } from './prompt-helpers';
import { CLI_LABEL_COL_WIDTH } from '../../../cli-helpers';

/** Above this many co-installing skills, the `via` hint is truncated to "first +N more". */
const VIA_INLINE_LIMIT = 2;

/** Renders the "N dependencies" lines, honoring the `via` inline-truncation limit. */
function buildDependencyLines(
  dependencies: ClosurePreview['dependencies'],
  ct: ReturnType<typeof chosenTarget>,
): string[] {
  return dependencies.map(({ artifact: a, via }) => {
    const viaDisplay =
      via.length <= VIA_INLINE_LIMIT ? via.join(', ') : `${via[0]} +${via.length - 1} more`;
    return `  ${kindNoun(ct, a.kind).padEnd(CLI_LABEL_COL_WIDTH)}  ${a.id}  (dependency of ${viaDisplay})`;
  });
}

/** Builds the "N artifact(s)" preview lines for the install-plan box. */
function buildArtifactLines(
  cp: ClosurePreview,
  ct: ReturnType<typeof chosenTarget>,
  includeDeps: boolean | undefined,
): string[] {
  const lines = cp.primary.map(
    a => `  ${kindNoun(ct, a.kind).padEnd(CLI_LABEL_COL_WIDTH)}  ${a.id}  (your pick)`,
  );
  if (includeDeps) {
    lines.push(...buildDependencyLines(cp.dependencies, ct));
  } else if (cp.dependencies.length > 0) {
    const n = cp.dependencies.length;
    lines.push(`  (${n} recommended dep${n !== 1 ? 's' : ''} excluded)`);
  }
  return lines;
}

/** The distinct config kinds (hook/settings/mcp) present in the resolved id list. */
function selectedConfigKindsOf(allIds: string[], s: AddWizardState): ConfigKind[] {
  return [
    ...new Set(
      allIds
        .map(id => s.ctx.catalog.byId.get(id)?.kind)
        .filter((k): k is ConfigKind => CONFIG_KINDS.has(k ?? '')),
    ),
  ];
}

/** Builds the "Config scope: … / Destination: …" lines when config kinds are selected. */
function buildConfigScopeLines(
  s: AddWizardState,
  ct: ReturnType<typeof chosenTarget>,
  allIds: string[],
): string[] {
  const hasConfigKind = allIds.some(id => CONFIG_KINDS.has(s.ctx.catalog.byId.get(id)?.kind ?? ''));
  if (!hasConfigKind || !ct?.configScopes) return [];

  const effectiveScopeValue = s.configScope ?? 'project';
  const scopeInfos = ct.configScopes(selectedConfigKindsOf(allIds, s), s.ctx.projectDir);
  const chosenScopeInfo = scopeInfos.find(si => si.value === effectiveScopeValue);
  const destinations = chosenScopeInfo?.destinations ?? [];
  const destParts = [
    ...new Set(destinations.map(d => (d.section ? `${d.fullPath}  › ${d.section}` : d.fullPath))),
  ];
  return [
    `Config scope: ${effectiveScopeValue}`,
    ...destParts.map((dp, i) => (i === 0 ? `Destination:  ${dp}` : `              ${dp}`)),
  ];
}

/** Builds the header lines (target/language/overwrite/config-scope) for the install-plan note. */
function buildPlanHeaderLines(s: AddWizardState, configScopeLines: string[]): string[] {
  return [
    `Target:       ${s.target}`,
    ...(s.language ? [`Language:     ${s.language}`] : []),
    `Overwrite:    ${s.overwrite ? 'yes' : 'no (warn on conflict)'}`,
    ...configScopeLines,
  ];
}

/** Shows the install-plan summary note above the "Ready to install?" prompt. */
function showInstallPlanNote(
  s: AddWizardState,
  cp: ClosurePreview,
  artifactLines: string[],
  configScopeLines: string[],
): void {
  const artifactCount = cp.primary.length + (s.includeDeps ? cp.dependencies.length : 0);
  note(
    [
      ...buildPlanHeaderLines(s, configScopeLines),
      '',
      `Will install ${artifactCount} artifact${artifactCount !== 1 ? 's' : ''}:`,
      ...artifactLines,
    ].join('\n'),
    'Install plan',
  );
}

/** Prompts "Ready to install?" and maps the answer to a StepOutcome. */
async function promptReadyToInstall(): Promise<StepOutcome> {
  const answer = await select({
    message: 'Ready to install?',
    options: [
      { value: 'proceed', label: 'Proceed with install', hint: '' },
      { value: BACK, label: '← Back', hint: 'change overwrite preference' },
      { value: 'cancel', label: 'Cancel', hint: '' },
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
    const ct = chosenTarget(s);
    const { ids: primaryIds } = resolveSelection({
      selectors: s.selectors!,
      filters: { language: s.language },
      catalog: s.ctx.catalog,
      packs: s.ctx.packs,
    });
    const cp: ClosurePreview = computeClosure(primaryIds, s.ctx.catalog);

    const artifactLines = buildArtifactLines(cp, ct, s.includeDeps);
    const configScopeLines = buildConfigScopeLines(s, ct, primaryIds);
    showInstallPlanNote(s, cp, artifactLines, configScopeLines);

    return promptReadyToInstall();
  },
};
