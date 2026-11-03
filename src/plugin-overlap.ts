/**
 * The duplicate guard's neutral half: which catalog ids an enabled marketplace plugin already
 * delivers. `add`, `status` and the wizard call {@link pluginOverlaps} instead of reading plugin
 * state themselves; the per-target reader lives on `Target.enabledPlugins`, and what a plugin
 * holds comes from `Target.marketplacePluginContents`, the same contents the build writes from
 * (decision 3, docs/plan-complement-mode.md).
 *
 * @module
 */
import { getAllTargets } from './targets';
import type { EnabledPlugin, EnabledPluginsEnv, Pack, ResolvedCatalog, Target } from './types';

export { DEFAULT_MARKETPLACE_NAME, marketplaceName } from './marketplace-name';

/** One enabled plugin that also delivers a catalog id. */
export interface PluginOverlap {
  /** The plugin name, without the `@<marketplace>` suffix. */
  plugin: string;
  /** The marketplace the plugin comes from. */
  marketplace: string;
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
 * What the registered target that builds a plugin marketplace says its plugins hold. Only that
 * target can answer; with none registered, nothing is delivered and every overlap is empty.
 */
function registeredPluginContents(
  catalog: ResolvedCatalog,
  packs: Pack[],
): ReadonlyMap<string, readonly string[]> {
  for (const target of getAllTargets()) {
    if (target.marketplacePluginContents !== undefined) {
      return target.marketplacePluginContents(catalog, packs);
    }
  }
  return new Map();
}

/** Every id in marketplace order, the first enabled plugin holding it deciding the winner. */
function collectOverlaps(
  contents: ReadonlyMap<string, readonly string[]>,
  sources: ReadonlyMap<string, string>,
  marketplace: string,
): Map<string, PluginOverlap> {
  const overlaps = new Map<string, PluginOverlap>();
  for (const [plugin, ids] of contents) {
    const source = sources.get(plugin);
    if (source === undefined) continue;
    for (const id of ids) {
      if (!overlaps.has(id)) overlaps.set(id, { plugin, marketplace, source });
    }
  }
  return overlaps;
}

/**
 * Joins what the target has enabled with what each marketplace plugin holds. A target that reads
 * no plugin state returns nothing and never computes the contents. Enabled names the current
 * contents don't know (an old or renamed plugin) are ignored, and when two enabled plugins hold
 * the same id the one earlier in marketplace order wins.
 */
export function pluginOverlaps(
  target: Target,
  catalog: ResolvedCatalog,
  packs: Pack[],
  env: EnabledPluginsEnv,
): PluginOverlapResult {
  if (target.enabledPlugins === undefined) return { overlaps: new Map(), warnings: [] };
  const { plugins, warnings } = target.enabledPlugins(env);
  const contents = registeredPluginContents(catalog, packs);
  return {
    overlaps: collectOverlaps(contents, enabledSources(plugins), env.marketplace),
    warnings,
  };
}

/** The one wording `add`, `status` and the wizard share for an overlapping id. */
export function formatPluginOverlap(id: string, overlap: PluginOverlap): string {
  return `${id} is also delivered by plugin ${overlap.plugin}@${overlap.marketplace} (enabled in ${overlap.source})`;
}
