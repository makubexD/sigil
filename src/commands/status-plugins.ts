/**
 * `sigil status`'s plugin half: which installed entries an enabled marketplace plugin also
 * delivers. The overlap is computed by `src/plugin-overlap.ts`; this module attaches the result
 * to each status, collects the readers' warnings, and renders both for the human output.
 *
 * @module
 */
import os from 'node:os';
import { overlayProject, reportOverlayIssues } from '../overlay-report';
import { formatPluginOverlap, marketplaceName, pluginOverlaps } from '../plugin-overlap';
import { resolveCatalog } from '../resolve';
import { getAllTargets } from '../targets';
import { perCatalog } from './shared/catalog-groups';
import type { PluginOverlap } from '../plugin-overlap';
import type { CatalogSourceOptions } from '../manifest/catalog-source';
import type { Manifest, StatusResult } from '../manifest';
import type { OverlaidCatalog } from '../overlays';
import type { EnabledPluginsEnv, LoadedCatalog, PacksConfig, ResolvedCatalog } from '../types';
import type { CatalogResult } from './shared/catalog-groups';

/** What one catalog group's plugin check adds: the statuses carrying overlaps and reader warnings. */
export interface StatusPluginInfo {
  statuses: StatusResult[];
  warnings: string[];
}

/** Where a status run resolves plugin state: the project root, and the home to read settings from. */
export interface StatusPluginContext {
  projectDir: string;
  homeDir?: string | undefined;
}

/** A status run's catalog options plus where its plugin state is read from. */
export type StatusPluginOptions = CatalogSourceOptions & StatusPluginContext;

/** Builds one group's statuses from the overlaid catalog the group was resolved into. */
type GroupBuilder<T> = (
  view: Manifest,
  catalog: LoadedCatalog,
  group: OverlaidCatalog,
) => Promise<T>;

/** The state `perCatalogWithPlugins` carries through one group's run. */
interface PluginRun<T> {
  opts: StatusPluginOptions;
  build: GroupBuilder<T>;
  overlaid: OverlaidCatalog[];
  warnings: string[];
}

/** The `plugin` field of a status row. */
type StatusPlugin = NonNullable<StatusResult['plugin']>;

/** One target's enabled plugins that deliver catalog ids, plus its reader warnings. */
interface TargetOverlaps {
  plugins: Map<string, StatusPlugin>;
  warnings: string[];
}

/** The environment a target's plugin reader gets; an absent `homeDir` falls back to the real home. */
function pluginEnv(context: StatusPluginContext, packsConfig: PacksConfig): EnabledPluginsEnv {
  return {
    projectDir: context.projectDir,
    homeDir: context.homeDir ?? os.homedir(),
    marketplace: marketplaceName(packsConfig.marketplace),
  };
}

/** The overlap map keyed by catalog id, in the shape a status row carries. */
function statusPlugins(overlaps: ReadonlyMap<string, PluginOverlap>): Map<string, StatusPlugin> {
  const plugins = new Map<string, StatusPlugin>();
  for (const [id, overlap] of overlaps) {
    plugins.set(id, {
      name: overlap.plugin,
      marketplace: overlap.marketplace,
      source: overlap.source,
    });
  }
  return plugins;
}

/** One target's overlaps, or `undefined` for a name no registered target answers to. */
function targetOverlaps(
  name: string,
  resolved: ResolvedCatalog,
  packsConfig: PacksConfig,
  env: EnabledPluginsEnv,
): TargetOverlaps | undefined {
  const target = getAllTargets().find(t => t.name === name);
  if (target === undefined) return undefined;
  const result = pluginOverlaps(target, resolved, packsConfig.packs, env);
  return { plugins: statusPlugins(result.overlaps), warnings: result.warnings };
}

/** Runs the enabled-plugin check once per distinct target the group's entries were installed for. */
function overlapsByTarget(
  statuses: readonly StatusResult[],
  resolved: ResolvedCatalog,
  packsConfig: PacksConfig,
  context: StatusPluginContext,
): { byTarget: Map<string, Map<string, StatusPlugin>>; warnings: string[] } {
  const env = pluginEnv(context, packsConfig);
  const byTarget = new Map<string, Map<string, StatusPlugin>>();
  const warnings: string[] = [];
  for (const name of new Set(statuses.map(s => s.entry.target))) {
    const found = targetOverlaps(name, resolved, packsConfig, env);
    if (found === undefined) continue;
    byTarget.set(name, found.plugins);
    for (const warning of found.warnings) {
      if (!warnings.includes(warning)) warnings.push(warning);
    }
  }
  return { byTarget, warnings };
}

/**
 * Runs `build` once per catalog the manifest records, then attaches each entry's delivering plugin
 * and collects the readers' warnings. The overlap helper behind `sigil status`.
 */
export async function perCatalogWithPlugins<T extends { statuses: StatusResult[] }>(
  manifest: Manifest,
  opts: StatusPluginOptions,
  build: GroupBuilder<T>,
): Promise<{ results: CatalogResult<T>[]; warnings: string[] }> {
  const run: PluginRun<T> = { opts, build, overlaid: [], warnings: [] };
  const results = await perCatalog(manifest, opts, (catalog, view, packsConfig) =>
    runOneGroup(run, catalog, view, packsConfig),
  );
  reportOverlayIssues(run.overlaid);
  return { results, warnings: [...new Set(run.warnings)] };
}

/** Builds one group's statuses, overlays its catalog, and attaches the plugin overlaps. */
async function runOneGroup<T extends { statuses: StatusResult[] }>(
  run: PluginRun<T>,
  catalog: LoadedCatalog,
  view: Manifest,
  packsConfig: PacksConfig,
): Promise<T> {
  const group = overlayProject(resolveCatalog(catalog), run.opts.projectDir);
  run.overlaid.push(group);
  const built = await run.build(view, catalog, group);
  const attached = attachPluginOverlaps(built.statuses, group.resolved, packsConfig, run.opts);
  run.warnings.push(...attached.warnings);
  return { ...built, statuses: attached.statuses };
}

/** Attaches each entry's delivering plugin to its status, and passes the reader warnings through. */
function attachPluginOverlaps(
  statuses: StatusResult[],
  resolved: ResolvedCatalog,
  packsConfig: PacksConfig,
  context: StatusPluginContext,
): StatusPluginInfo {
  const { byTarget, warnings } = overlapsByTarget(statuses, resolved, packsConfig, context);
  return {
    statuses: statuses.map(s => withPlugin(s, byTarget)),
    warnings,
  };
}

/** `s` carrying the plugin that delivers its id for its own target, when there is one. */
function withPlugin(
  s: StatusResult,
  byTarget: Map<string, Map<string, StatusPlugin>>,
): StatusResult {
  const plugin = byTarget.get(s.entry.target)?.get(s.entry.id);
  return plugin === undefined ? s : { ...s, plugin };
}

/** One note per status an enabled plugin also delivers (sorted by id), then each reader warning. */
export function printPluginNotes(
  statuses: readonly StatusResult[],
  warnings: readonly string[],
): void {
  const delivered = statuses
    .filter((s): s is StatusResult & { plugin: StatusPlugin } => s.plugin !== undefined)
    .sort((a, b) => a.entry.id.localeCompare(b.entry.id));
  for (const s of delivered) {
    const line = `${formatPluginOverlap(s.entry.id, asOverlap(s.plugin))} (installed for ${s.entry.target})`;
    console.log(`  ℹ  ${line}`);
  }
  for (const warning of warnings) console.log(`  ⚠  plugin check: ${warning}`);
}

/** The status row's `plugin` field in the shape the shared note wording takes. */
function asOverlap(plugin: StatusPlugin): PluginOverlap {
  return { plugin: plugin.name, marketplace: plugin.marketplace, source: plugin.source };
}
