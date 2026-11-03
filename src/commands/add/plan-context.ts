/**
 * Shared context object threaded through the `sigil add` plan-building helpers
 * (plan-ids.ts, plan-scaffold.ts) — bundles the values every step needs so each
 * helper takes at most a couple of parameters instead of the same 5-6 repeated.
 * Also holds the plugin duplicate guard's plan half: the overlap lookup and `--complement`.
 *
 * @module
 */
import os from 'node:os';
import type { MarketplaceIdentity, Pack, ResolvedCatalog, Target } from '../../types';
import { computeClosure, type SkippedArtifact } from '../../select';
import {
  marketplaceName,
  pluginOverlaps,
  pluginLabel,
  type PluginOverlap,
  type PluginOverlapResult,
} from '../../plugin-overlap';
import type { ResolvedAddInputs } from './resolve-inputs';
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
  /** packs.yaml's `marketplace:` identity, when configured (the plugin readers' marketplace name). */
  marketplace: MarketplaceIdentity | undefined;
}

/** Candidate ids, split for the plan: what is installed, what is skipped, and why. */
export interface PartitionedIds {
  skipped: SkippedArtifact[];
  /** Overlaps shown to the user; empty under `--complement`, where those ids are skipped. */
  pluginOverlaps: ReadonlyMap<string, PluginOverlap>;
  upToDateIds: string[];
  wholeFileIds: string[];
  configIds: string[];
}

/**
 * The candidate ids this target's enabled plugins also deliver: one reader call, with the reader's
 * warnings passed through for the caller to show. A target with no plugin reader yields nothing.
 */
export function computePluginOverlaps(ctx: PlanCtx, ids: readonly string[]): PluginOverlapResult {
  const { overlaps, warnings } = pluginOverlaps(ctx.target, ctx.resolved, ctx.packs, {
    projectDir: ctx.opts.projectDir,
    homeDir: ctx.opts.homeDir ?? os.homedir(),
    marketplace: marketplaceName(ctx.marketplace),
  });
  const candidates = new Set([...ids, ...dependencyIds(ctx, ids)]);
  return { overlaps: new Map([...overlaps].filter(([id]) => candidates.has(id))), warnings };
}

/** The `uses:` dependencies `add` would also write for `ids`; none under `--no-deps`. */
function dependencyIds(ctx: PlanCtx, ids: readonly string[]): string[] {
  if (!ctx.inputs.includeDeps) return [];
  return computeClosure([...ids], ctx.resolved, ctx.target).dependencies.map(d => d.artifact.id);
}

/**
 * `--complement`: move every overlapping id to `skipped` with the `plugin` cause, and return the
 * ids left to install. A skipped skill is never scaffolded, so its `uses:` deps are named
 * explicitly — the ones the plugin does not hold, never a wider install.
 */
export function complement(
  ctx: PlanCtx,
  ids: string[],
  skipped: SkippedArtifact[],
  overlaps: ReadonlyMap<string, PluginOverlap>,
): string[] {
  const removed = ids.filter(id => overlaps.has(id));
  recordPluginSkips(ctx, [...overlaps.keys()].sort(), skipped, overlaps);
  const kept = ids.filter(id => !overlaps.has(id));
  if (!ctx.inputs.includeDeps) return kept;
  const { dependencies } = computeClosure(removed, ctx.resolved, ctx.target);
  const deps = dependencies.map(d => d.artifact.id);
  return [...kept, ...deps.filter(id => !overlaps.has(id) && !kept.includes(id))];
}

/** Adds one `plugin` skip per id, naming the plugin and the settings file that enabled it. */
function recordPluginSkips(
  ctx: PlanCtx,
  ids: readonly string[],
  skipped: SkippedArtifact[],
  overlaps: ReadonlyMap<string, PluginOverlap>,
): void {
  for (const id of ids) {
    const overlap = overlaps.get(id);
    if (overlap === undefined) continue;
    skipped.push({
      id,
      kind: ctx.resolved.byId.get(id)?.kind ?? '',
      cause: 'plugin',
      reason: `delivered by plugin ${pluginLabel(overlap)} (${overlap.source})`,
    });
  }
}
