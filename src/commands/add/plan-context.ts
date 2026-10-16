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
  /** The catalog with the project's overlays applied (src/overlays.ts). */
  resolved: ResolvedCatalog;
  /** Ids whose overlay entry was refused, with the reason: never installed wider than asked. */
  refusedOverlays: ReadonlyMap<string, string>;
  target: Target;
  targetName: string;
  inputs: ResolvedAddInputs;
  packs: Pack[];
}
