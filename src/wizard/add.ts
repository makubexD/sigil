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
import { log } from './prompts';
import { intro, noteOnce } from './frame';
import type { ResolvedCatalog, Pack } from '../types';
import { getAllTargets } from '../targets';
import type { WizardResult } from './types';
import { runSteps } from './engine';
import { ADD_STEPS } from './steps/add';
import { adoptTarget } from './steps/add/target';
import type { AddWizardState } from './steps/add';

const HOW_IT_WORKS = [
  'An artifact is one installable item: a skill, agent, rule, command, MCP server, hook or',
  'settings entry. Choose what you want; nothing is written until you confirm at the end.',
  'Every step has a "← Back" row, and Ctrl+C cancels without changing anything.',
].join('\n');

/** A tool the folder or `--target` already chose, and the sentence that tells the user so. */
export interface FixedTarget {
  name: string;
  /** Shown once, so a skipped question is never a mystery. */
  notice: string;
}

/** Where the wizard runs and what is already known about the tool. */
export interface WizardSite {
  projectDir: string;
  /** The tool preselected when none is fixed. */
  detectedTarget: string;
  fixed?: FixedTarget | undefined;
}

function buildInitialState(
  catalog: ResolvedCatalog,
  packs: Pack[],
  site: WizardSite,
): AddWizardState {
  return {
    ctx: {
      catalog,
      packs,
      detectedTarget: site.detectedTarget,
      projectDir: site.projectDir,
      scaffoldableTargets: getAllTargets().filter(t => Boolean(t.scaffold)),
      fixedTarget: site.fixed?.name,
    },
    // Matches the pre-registry wizard's default: config-kind-only selections
    // (which skip the deps prompt entirely) behave as if "Yes" was answered.
    includeDeps: true,
    // The overwrite step is asked only when something conflicts; otherwise nothing is replaced.
    overwrite: false,
  };
}

function toWizardResult(done: AddWizardState): WizardResult {
  return {
    target: done.target!,
    selectors: done.selectors!,
    includeDeps: done.includeDeps!,
    overwrite: done.overwrite!,
    language: done.language,
    configScope: done.configScope,
  };
}

/** The installer wizard, with the tool question skipped when `site.fixed` names the tool. */
export async function runWizardAt(
  catalog: ResolvedCatalog,
  packs: Pack[],
  site: WizardSite,
): Promise<WizardResult | null> {
  intro('📦  sigil  —  interactive installer');
  noteOnce('how-it-works', HOW_IT_WORKS, 'How this works');

  const state = buildInitialState(catalog, packs, site);
  if (site.fixed) {
    log.info(site.fixed.notice);
    if (!(await adoptTarget(state, site.fixed.name))) return null;
  }
  const done = await runSteps(ADD_STEPS, state);
  return done ? toWizardResult(done) : null;
}

/** The installer wizard that always asks which tool. */
export function runWizard(
  catalog: ResolvedCatalog,
  packs: Pack[],
  detectedTarget: string,
  projectDir: string,
): Promise<WizardResult | null> {
  return runWizardAt(catalog, packs, { detectedTarget, projectDir });
}
