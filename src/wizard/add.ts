/**
 * Step-registry installer wizard for `sigil add`.
 *
 * The step machine itself lives in ./engine.ts (runSteps) — a linear step list
 * where each step's optional `shouldShow` predicate decides whether it renders.
 * History (for "← Back") is owned entirely by the engine: it pushes a frame only
 * for a step that actually ran, so a skipped step can never leave a stale frame
 * behind (the bug class this replaced: a pass-through arm in the old hand-rolled
 * state machine once pushed a history frame it shouldn't have).
 *
 * Guard: caller must check isInteractiveTTY() before invoking runWizard().
 */
import { intro } from '@clack/prompts';
import type { ResolvedCatalog, Pack } from '../types';
import { getAllTargets } from '../targets';
import type { WizardResult } from './types';
import { runSteps } from './engine';
import { ADD_STEPS } from './steps/add';
import type { AddWizardState } from './steps/add';

export async function runWizard(
  catalog: ResolvedCatalog,
  packs: Pack[],
  detectedTarget: string,
  projectDir: string,
): Promise<WizardResult | null> {
  intro('📦  sigil  —  interactive installer');

  const state: AddWizardState = {
    ctx: {
      catalog,
      packs,
      detectedTarget,
      projectDir,
      scaffoldableTargets: getAllTargets().filter(t => Boolean(t.scaffold)),
    },
    // Matches the pre-registry wizard's default: config-kind-only selections
    // (which skip the deps prompt entirely) behave as if "Yes" was answered.
    includeDeps: true,
  };

  const done = await runSteps(ADD_STEPS, state);
  if (!done) return null;

  return {
    target: done.target!,
    selectors: done.selectors!,
    includeDeps: done.includeDeps!,
    overwrite: done.overwrite!,
    language: done.language,
    configScope: done.configScope,
  };
}
