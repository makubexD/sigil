/**
 * `sigil add` command — orchestration only.
 *
 * Split into plan (./plan.ts) / execute (./execute.ts) / render (./render.ts) so
 * dry-run is a *renderer* over the same plan a real install executes, rather than
 * a separate code path that could silently drift from what actually gets written.
 *
 * @module
 */
import { buildAddPlan } from './plan';
import { executeAddPlan } from './execute';
import { renderDryRun, renderOutcome } from './render';

export interface AddOpts {
  target?: string;
  projectDir: string;
  catalogDir: string;
  packs: string;
  kind?: string;
  exclude?: string;
  language?: string;
  /** Commander sets this to false when --no-deps is passed, true otherwise. */
  deps: boolean;
  dryRun: boolean;
  interactive: boolean;
  yes: boolean;
  overwrite: boolean;
  scope?: string;
  /** Deprecated alias for --scope local. */
  settingsLocal: boolean;
}

export async function runAdd(selectors: string[], opts: AddOpts): Promise<void> {
  const plan = await buildAddPlan(selectors, opts);
  if (!plan) return; // wizard cancelled

  if (plan.wholeFileIds.length === 0 && plan.configIds.length === 0) {
    console.log('No artifacts to install (all were filtered out or unsupported).');
    return;
  }

  if (opts.dryRun) {
    await renderDryRun(plan);
    return;
  }

  const outcome = await executeAddPlan(plan);
  renderOutcome(plan, outcome);
}
