/**
 * Which Copilot CLI marketplace plugins are installed, read from the folders under
 * `~/.copilot/installed-plugins/<marketplace>/`.
 *
 * Copilot installs a marketplace plugin as one folder named after the plugin, so each regular
 * folder under the marketplace folder is one installed plugin. A folder that is a symbolic link
 * is not counted and never followed, and neither is a marketplace folder that is itself a link.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import type { EnabledPlugin, EnabledPluginsEnv, EnabledPluginsResult } from '../../types';

/** How the plugin folder is named in `EnabledPlugin.source` and in warnings. */
const SOURCE_ROOT = '~/.copilot/installed-plugins';

/** The installed plugins of `env.marketplace`, sorted by name, plus any read warnings. */
export function readCopilotEnabledPlugins(env: EnabledPluginsEnv): EnabledPluginsResult {
  const warnings: string[] = [];
  const source = `${SOURCE_ROOT}/${env.marketplace}`;
  const dir = path.join(env.homeDir, '.copilot', 'installed-plugins', env.marketplace);

  let entries: fs.Dirent[];
  try {
    // A folder that is missing, or is a link or a file rather than a directory, is not a set of
    // installed plugins; only a real directory is listed.
    const stat = fs.lstatSync(dir, { throwIfNoEntry: false });
    if (stat === undefined || !stat.isDirectory()) return { plugins: [], warnings };
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    warnings.push(`${source}: ${detail}`);
    return { plugins: [], warnings };
  }

  // A Dirent for a symbolic link reports isSymbolicLink(), not isDirectory(), so a link is
  // skipped instead of read.
  const plugins: EnabledPlugin[] = entries
    .filter(entry => entry.isDirectory())
    .map(entry => ({ name: entry.name, source: `${source}/${entry.name}` }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return { plugins, warnings };
}
