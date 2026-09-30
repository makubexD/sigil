import { select, note, isCancel, outro, cancel } from '@clack/prompts';
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

/** Final summary + confirm step. Returning 'next' past this ends the wizard successfully. */
export const proceedStep: WizardStep<AddWizardState> = {
  id: 'proceed',
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

    const artifactLines: string[] = [];
    for (const a of cp.primary) {
      artifactLines.push(`  ${kindNoun(ct, a.kind).padEnd(12)}  ${a.id}  (your pick)`);
    }
    if (s.includeDeps) {
      for (const { artifact: a, via } of cp.dependencies) {
        const viaDisplay = via.length <= 2 ? via.join(', ') : `${via[0]} +${via.length - 1} more`;
        artifactLines.push(
          `  ${kindNoun(ct, a.kind).padEnd(12)}  ${a.id}  (dependency of ${viaDisplay})`,
        );
      }
    } else if (cp.dependencies.length > 0) {
      const n = cp.dependencies.length;
      artifactLines.push(`  (${n} recommended dep${n !== 1 ? 's' : ''} excluded)`);
    }
    const artifactCount = cp.primary.length + (s.includeDeps ? cp.dependencies.length : 0);

    const allIds = primaryIds;
    const hasConfigKind = allIds.some(id =>
      CONFIG_KINDS.has(s.ctx.catalog.byId.get(id)?.kind ?? ''),
    );
    let configScopeLines: string[] = [];
    if (hasConfigKind && ct?.configScopes) {
      const selectedConfigKinds = [
        ...new Set(
          allIds
            .map(id => s.ctx.catalog.byId.get(id)?.kind)
            .filter((k): k is ConfigKind => CONFIG_KINDS.has(k ?? '')),
        ),
      ];
      const effectiveScopeValue = s.configScope ?? 'project';
      const scopeInfos = ct.configScopes(selectedConfigKinds, s.ctx.projectDir);
      const chosenScopeInfo = scopeInfos.find(si => si.value === effectiveScopeValue);
      const destinations = chosenScopeInfo?.destinations ?? [];
      const destParts = [
        ...new Set(
          destinations.map(d => (d.section ? `${d.fullPath}  › ${d.section}` : d.fullPath)),
        ),
      ];
      configScopeLines = [
        `Config scope: ${effectiveScopeValue}`,
        ...destParts.map((dp, i) => (i === 0 ? `Destination:  ${dp}` : `              ${dp}`)),
      ];
    }

    note(
      [
        `Target:       ${s.target}`,
        ...(s.language ? [`Language:     ${s.language}`] : []),
        `Overwrite:    ${s.overwrite ? 'yes' : 'no (warn on conflict)'}`,
        ...configScopeLines,
        '',
        `Will install ${artifactCount} artifact${artifactCount !== 1 ? 's' : ''}:`,
        ...artifactLines,
      ].join('\n'),
      'Install plan',
    );

    const answer = await select({
      message: 'Ready to install?',
      options: [
        { value: 'proceed', label: 'Proceed with install', hint: '' },
        { value: BACK, label: '← Back', hint: 'change overwrite preference' },
        { value: 'cancel', label: 'Cancel', hint: '' },
      ],
    });
    if (isCancel(answer) || answer === 'cancel') {
      cancel('Install cancelled.');
      return 'cancel';
    }
    if (answer === BACK) return 'back';

    outro('Running install…');
    return 'next';
  },
};
