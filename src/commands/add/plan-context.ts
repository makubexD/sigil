/**
 * Shared context object threaded through the `sigil add` plan-building helpers
 * (plan-ids.ts, plan-scaffold.ts) — bundles the values every step needs so each
 * helper takes at most a couple of parameters instead of the same 5-6 repeated.
 *
 * @module
 */
import type { ResolvedCatalog, Target } from '../../types';
import type { ResolvedAddInputs } from './resolve-inputs';
import type { Pack } from '../../types';
import type { AddOpts } from './index';

export interface PlanCtx {
  opts: AddOpts;
  resolved: ResolvedCatalog;
  target: Target;
  targetName: string;
  inputs: ResolvedAddInputs;
  packs: Pack[];
}
