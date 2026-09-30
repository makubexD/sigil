/**
 * Mutable state threaded through the `add` wizard's step registry, plus the
 * read-only context each step needs (catalog, packs, target list).
 *
 * @module
 */
import type { ResolvedCatalog, Pack, ArtifactKind, Target } from '../../../types';
import type { ArtifactInstallState } from '../../../install-state';
import { supportsKind } from '../../../targets/capabilities';

export type ScopeChoice = 'all' | 'pack' | 'browse';

/** Sentinel value used to signal "go back one step" in wizard prompts. */
export const BACK = '__back__';

/** Immutable context every step reads from but never mutates. */
export interface AddWizardContext {
  readonly catalog: ResolvedCatalog;
  readonly packs: Pack[];
  readonly detectedTarget: string;
  readonly projectDir: string;
  readonly scaffoldableTargets: Target[];
}

/** Mutable answers accumulated as the wizard progresses. */
export interface AddWizardState {
  readonly ctx: AddWizardContext;
  target?: string;
  scope?: ScopeChoice;
  kindPick?: ArtifactKind | undefined;
  /** Set by browseKindStep: true = "All types" picker, false = single-kind picker. */
  browseAll?: boolean | undefined;
  selectors?: string[] | undefined;
  language?: string | undefined;
  includeDeps?: boolean;
  overwrite?: boolean;
  configScope?: string | undefined;
  installStates?: Map<string, ArtifactInstallState>;
  installStatesForTarget?: string;
}

/** The currently chosen target adapter, or undefined before the target step runs. */
export function chosenTarget(s: AddWizardState): Target | undefined {
  return s.ctx.scaffoldableTargets.find(t => t.name === s.target);
}

/** Catalog artifacts supported by the chosen target (or the full catalog before one is chosen). */
export function visibleArtifacts(s: AddWizardState) {
  const ct = chosenTarget(s);
  return ct
    ? s.ctx.catalog.artifacts.filter(a => supportsKind(ct, a.kind))
    : s.ctx.catalog.artifacts;
}
