/**
 * The duplicate guard's neutral half: which catalog ids an enabled marketplace plugin already
 * delivers. `add`, `status` and the wizard call {@link pluginOverlaps} instead of reading plugin
 * state themselves; the per-target reader lives on `Target.enabledPlugins`, and what a plugin
 * holds comes from {@link pluginContentsFor}: the target's own `Target.marketplacePluginContents`
 * (the same contents its build writes), else that of the target named by
 * `Target.pluginContentsFrom`, else nothing (decision 3, docs/plan-complement-mode.md).
 * `Target.pluginKinds`, when set, limits the overlaps to the kinds the tool really loads from a
 * plugin (decision 2, docs/plan-complement-follow-ups.md).
 *
 * @module
 */
import { getAllTargets } from './targets';
import { catalogForPlatform } from './select';
import type { EnabledPlugin, EnabledPluginsEnv, Pack, ResolvedCatalog, Target } from './types';

export { DEFAULT_MARKETPLACE_NAME, marketplaceName } from './marketplace-name';

/** One enabled plugin that also delivers a catalog id. */
export interface PluginOverlap {
  /** The plugin name, without the `@<marketplace>` suffix. */
  plugin: string;
  /** The marketplace the plugin comes from; absent when the tool installs plugins outside one. */
  marketplace?: string;
  /** Where the plugin is enabled (a settings file or a plugin folder). */
  source: string;
}

/** The overlaps found, plus the problems the target met while reading its plugin state. */
export interface PluginOverlapResult {
  /** Catalog id → the first enabled plugin in marketplace order that delivers it. */
  overlaps: ReadonlyMap<string, PluginOverlap>;
  /** Reader warnings, passed through for the caller to show. */
  warnings: string[];
}

/** Plugin name → where the first enabled entry for it came from. */
function enabledSources(plugins: EnabledPlugin[]): Map<string, string> {
  const sources = new Map<string, string>();
  for (const plugin of plugins) {
    if (!sources.has(plugin.name)) sources.set(plugin.name, plugin.source);
  }
  return sources;
}

/**
 * What the marketplace plugins `target` reads hold. A target that builds its own plugin
 * marketplace answers directly; one that installs another target's plugins names it in
 * `Target.pluginContentsFrom`; with neither, nothing is delivered and every overlap is empty.
 */
function pluginContentsFor(
  target: Target,
  catalog: ResolvedCatalog,
  packs: Pack[],
): ReadonlyMap<string, readonly string[]> {
  const source =
    target.marketplacePluginContents !== undefined
      ? target
      : getAllTargets().find(candidate => candidate.name === target.pluginContentsFrom);
  if (source?.marketplacePluginContents === undefined) return new Map();
  // The build compiles each target from its `platforms:` slice, so the contents must too.
  return source.marketplacePluginContents(catalogForPlatform(catalog, source.name), packs);
}

/** Everything {@link collectOverlaps} joins. */
interface OverlapJoin {
  readonly target: Target;
  readonly catalog: ResolvedCatalog;
  readonly contents: ReadonlyMap<string, readonly string[]>;
  readonly sources: ReadonlyMap<string, string>;
  readonly marketplace: string | undefined;
}

/** Whether the target loads an artifact of this id's kind from a plugin. */
function isLoadedKind(target: Target, catalog: ResolvedCatalog, id: string): boolean {
  const kinds = target.pluginKinds;
  if (kinds === undefined) return true;
  const kind = catalog.byId.get(id)?.kind;
  return kind !== undefined && kinds.includes(kind);
}

/** Every id in marketplace order, the first enabled plugin holding it deciding the winner. */
function collectOverlaps(join: OverlapJoin): Map<string, PluginOverlap> {
  const { target, catalog, contents, sources, marketplace } = join;
  const overlaps = new Map<string, PluginOverlap>();
  for (const [plugin, ids] of contents) {
    const source = sources.get(plugin);
    if (source === undefined) continue;
    for (const id of ids) {
      if (overlaps.has(id) || !isLoadedKind(target, catalog, id)) continue;
      const overlap: PluginOverlap = { plugin, source };
      if (marketplace !== undefined) overlap.marketplace = marketplace;
      overlaps.set(id, overlap);
    }
  }
  return overlaps;
}

/**
 * Joins what the target has enabled with what each marketplace plugin holds. A target that reads
 * no plugin state returns nothing and never computes the contents. Enabled names the current
 * contents don't know (an old or renamed plugin) are ignored; ids of a kind outside
 * `Target.pluginKinds` are ignored too; and when two enabled plugins hold the same id the one
 * earlier in marketplace order wins.
 */
export function pluginOverlaps(
  target: Target,
  catalog: ResolvedCatalog,
  packs: Pack[],
  env: EnabledPluginsEnv,
): PluginOverlapResult {
  if (target.enabledPlugins === undefined) return { overlaps: new Map(), warnings: [] };
  const { plugins, warnings, marketplace } = target.enabledPlugins(env);
  const contents = pluginContentsFor(target, catalog, packs);
  return {
    overlaps: collectOverlaps({
      target,
      catalog,
      contents,
      sources: enabledSources(plugins),
      // A reader that installs plugins outside a marketplace (`marketplace: false`) names none.
      marketplace: marketplace === false ? undefined : env.marketplace,
    }),
    warnings,
  };
}

/** The catalog ids an enabled plugin of `target` delivers; reader warnings are ignored. */
export function pluginDeliveredIds(
  target: Target,
  catalog: ResolvedCatalog,
  packs: Pack[],
  env: EnabledPluginsEnv,
): Set<string> {
  return new Set(pluginOverlaps(target, catalog, packs, env).overlaps.keys());
}

/** The one wording `add`, `status` and the wizard share for an overlapping id. */
export function formatPluginOverlap(id: string, overlap: PluginOverlap): string {
  return `${id} is also delivered by plugin ${pluginLabel(overlap)} (enabled in ${overlap.source})`;
}

/** `<plugin>@<marketplace>`, or the bare plugin name when it comes from no marketplace. */
export function pluginLabel(overlap: PluginOverlap): string {
  return overlap.marketplace === undefined
    ? overlap.plugin
    : `${overlap.plugin}@${overlap.marketplace}`;
}
