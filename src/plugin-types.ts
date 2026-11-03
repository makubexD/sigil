/**
 * The shapes a target's plugin reader returns and what a plugin holds, used by
 * `Target.enabledPlugins`, `Target.marketplacePluginContents` and `src/plugin-overlap.ts`.
 * Re-exported from `src/types.ts`.
 *
 * @module
 */

/**
 * Where a target looks for its enabled plugins: the project root, the user's home (injectable so
 * tests never read the real one) and the marketplace name whose plugins are counted.
 */
export type EnabledPluginsEnv = { projectDir: string; homeDir: string; marketplace: string };

/** One enabled plugin: its name without the `@<marketplace>` suffix, and where it is enabled. */
export type EnabledPlugin = { name: string; source: string };

/** Plugin name → the catalog ids that plugin delivers, in marketplace order. */
export type PluginContents = ReadonlyMap<string, readonly string[]>;

/** The enabled plugins a target found, plus the problems met while reading its settings. */
export interface EnabledPluginsResult {
  plugins: EnabledPlugin[];
  /** Read problems (a refused or unparseable settings file), for the caller to show. */
  warnings: string[];
}
