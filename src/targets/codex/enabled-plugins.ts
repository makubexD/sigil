/**
 * Which Codex marketplace plugins are installed, read from the cache folders under
 * `$CODEX_HOME/plugins/cache/<marketplace>/` and the `plugins."<name>@<marketplace>"` tables in
 * `$CODEX_HOME/config.toml` (default `~/.codex`).
 *
 * Codex reports a plugin as installed only when both exist (decision 7,
 * docs/plan-complement-follow-ups.md). A folder without its table is a leftover cache entry, and a
 * table without its folder is a stale config entry; neither counts. A folder that is a symbolic
 * link is never followed. The project `.codex/config.toml` is not read: it applies only in a
 * trusted project, and trust lives in Codex's own state.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { readRegularFile } from '../../safe-read';
import { homeDisplayPath } from '../home-path';
import type { EnabledPlugin, EnabledPluginsEnv, EnabledPluginsResult } from '../../types';

const KIB = 1024;

/** A `config.toml` is small; anything far larger is not one sigil should read. */
const MAX_CONFIG_KIB = 1024;

/** The `config.toml` size cap. */
const CONFIG_MAX_BYTES = MAX_CONFIG_KIB * KIB;

/** A parsed config file, or why it could not be read. */
type ConfigRead =
  | { kind: 'missing' }
  | { kind: 'invalid'; detail: string }
  | { kind: 'parsed'; config: Record<string, unknown> };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The Codex home: a non-empty `CODEX_HOME`, else `~/.codex`. */
function codexHomeOf(env: EnabledPluginsEnv): { dir: string; isDefault: boolean } {
  const configured = (env.vars ?? process.env).CODEX_HOME;
  return configured !== undefined && configured.length > 0
    ? { dir: configured, isDefault: false }
    : { dir: path.join(env.homeDir, '.codex'), isDefault: true };
}

/** How the marketplace cache is named in `EnabledPlugin.source` and in warnings. */
function cacheLabel(env: EnabledPluginsEnv, codexHome: string, isDefault: boolean): string {
  if (isDefault) return `~/.codex/plugins/cache/${env.marketplace}`;
  const dir = path.join(codexHome, 'plugins', 'cache', env.marketplace);
  return homeDisplayPath(dir, env.homeDir);
}

/** Names of the regular plugin folders in the cache; a link is skipped, never followed. */
function pluginFolders(dir: string, label: string, warnings: string[]): string[] {
  let entries: fs.Dirent[];
  try {
    // A folder that is missing, or is a link or a file rather than a directory, holds no plugins.
    const stat = fs.lstatSync(dir, { throwIfNoEntry: false });
    if (stat === undefined || !stat.isDirectory()) return [];
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    warnings.push(`${label}: ${detail}`);
    return [];
  }
  // A Dirent for a symbolic link reports isSymbolicLink(), not isDirectory(), so a link is skipped.
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** The file's TOML tables, or why it is missing, unreadable or invalid. */
function readConfig(file: string): ConfigRead {
  try {
    if (fs.lstatSync(file, { throwIfNoEntry: false }) === undefined) return { kind: 'missing' };
  } catch {
    // The read below reports the path problem as a warning.
  }
  const read = readRegularFile(file, { maxBytes: CONFIG_MAX_BYTES });
  if ('reason' in read) return { kind: 'invalid', detail: read.reason };
  try {
    return { kind: 'parsed', config: parse(read.content) as Record<string, unknown> };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { kind: 'invalid', detail };
  }
}

/** The `plugins` table of a parsed config, if the file has one. */
function pluginsTable(config: Record<string, unknown>): Record<string, unknown> | undefined {
  return isPlainObject(config.plugins) ? config.plugins : undefined;
}

/** Whether the plugin's own table says enabled, else `plugins._default.enabled`, else true. */
function isEnabled(plugins: Record<string, unknown>, key: string): boolean {
  const entry = plugins[key];
  if (!isPlainObject(entry)) return false;
  if (typeof entry.enabled === 'boolean') return entry.enabled;
  const fallback = isPlainObject(plugins._default) ? plugins._default.enabled : undefined;
  return typeof fallback === 'boolean' ? fallback : true;
}

/** The candidate folders the config counts as installed. */
function enabledNames(names: string[], config: ConfigRead, marketplace: string): string[] {
  if (config.kind === 'missing') return [];
  if (config.kind === 'invalid') return names;
  const plugins = pluginsTable(config.config);
  if (plugins === undefined) return [];
  return names.filter(name => isEnabled(plugins, `${name}@${marketplace}`));
}

/** The installed plugins of `env.marketplace`, sorted by name, plus any read warnings. */
export function readCodexEnabledPlugins(env: EnabledPluginsEnv): EnabledPluginsResult {
  const warnings: string[] = [];
  const { dir: codexHome, isDefault } = codexHomeOf(env);
  const label = cacheLabel(env, codexHome, isDefault);
  const cache = path.join(codexHome, 'plugins', 'cache', env.marketplace);
  const names = pluginFolders(cache, label, warnings);

  const configFile = path.join(codexHome, 'config.toml');
  const config = readConfig(configFile);
  if (config.kind === 'invalid') {
    warnings.push(`${homeDisplayPath(configFile, env.homeDir)}: ${config.detail}`);
  }

  const plugins: EnabledPlugin[] = enabledNames(names, config, env.marketplace).map(name => ({
    name,
    source: `${label}/${name}`,
  }));
  return { plugins, warnings };
}
