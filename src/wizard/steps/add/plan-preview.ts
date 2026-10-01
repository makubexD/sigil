/**
 * What the install would really do for the wizard's current answers, so every step that shows a
 * count or a list (dependencies, conflicts, the plan box) agrees with the real install.
 *
 * @module
 */
import { resolveSelection, computeClosure } from '../../../select';
import type { SelectionResult } from '../../../select';
import type { ArtifactInstallState } from '../../../install-state';
import { supportedKinds } from '../../../targets/capabilities';
import { chosenTarget } from './state';
import type { AddWizardState } from './state';

/** The picks resolved the way `sigil add` resolves them: the chosen target's kinds and platform only. */
export function previewSelection(s: AddWizardState): SelectionResult {
  const target = chosenTarget(s);
  return resolveSelection({
    selectors: s.selectors ?? [],
    filters: { language: s.language },
    catalog: s.ctx.catalog,
    packs: s.ctx.packs,
    ...(target ? { supportedKinds: supportedKinds(target) } : {}),
    ...(s.target ? { targetName: s.target } : {}),
  });
}

/** Ids among `ids` that are already installed and unchanged (skipped unless overwrite is on). */
export function upToDateIds(s: AddWizardState, ids: readonly string[]): string[] {
  return ids.filter(id => s.installStates?.get(id)?.state === 'up-to-date');
}

const CONFLICT_STATES = new Set<string>(['foreign', 'drifted', 'outdated']);

/** Picks (and their helpers, when included) that meet a file already on disk that is not an untouched sigil install. */
export function conflictsFor(s: AddWizardState): ArtifactInstallState[] {
  const closure = computeClosure(previewSelection(s).ids, s.ctx.catalog);
  const ids = [
    ...closure.primary.map(a => a.id),
    ...(s.includeDeps ? closure.dependencies.map(d => d.artifact.id) : []),
  ];
  return ids
    .map(id => s.installStates?.get(id))
    .filter((st): st is ArtifactInstallState => st !== undefined && CONFLICT_STATES.has(st.state));
}
