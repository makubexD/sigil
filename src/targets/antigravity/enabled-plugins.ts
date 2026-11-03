/**
 * Which Antigravity plugins are installed, read from the plugin folders in the workspace's
 * `.agents/plugins/` and the user's `~/.gemini/config/plugins/` (decision 8,
 * `git show 69ced68:docs/plan-complement-follow-ups.md`).
 *
 * A regular folder is one plugin only when it holds a root `plugin.json` naming that folder and
 * has no `.claude-plugin/` folder. An `agy plugin import claude` copy has that folder, and its
 * hooks do not work on Antigravity (probe U7 in docs/decisions/antigravity-target-2026-11.md),
 * so it must never count. The workspace scope is listed first, and the first folder for a name
 * wins. A folder that is a symbolic link is never followed.
 *
 * `plugins.<name>.enabled: false` in `~/.gemini/config/config.json` disables a plugin (probe A2);
 * anything else, including a missing entry, counts as enabled. Antigravity has no third-party
 * marketplace, so the result names no marketplace.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { readRegularFile } from '../../safe-read';
import { homeDisplayPath } from '../home-path';
import type { EnabledPlugin, EnabledPluginsEnv, EnabledPluginsResult } from '../../types';

const KIB = 1024;

/** A `plugin.json` is a small manifest; anything far larger is not one sigil should read. */
const PLUGIN_JSON_MAX_KIB = 64;

/** The `plugin.json` size cap. */
const PLUGIN_JSON_MAX_BYTES = PLUGIN_JSON_MAX_KIB * KIB;

/** Antigravity's `config.json` is small; the cap mirrors the other readers' config files. */
const CONFIG_MAX_KIB = 1024;

/** The `config.json` size cap. */
const CONFIG_MAX_BYTES = CONFIG_MAX_KIB * KIB;

/** One place plugins are installed: the folder and how it is named in `source` and warnings. */
interface PluginScope {
  readonly dir: string;
  readonly label: string;
}

/** What reading one folder's `plugin.json` found. */
type ManifestState =
  | { kind: 'ok' }
  /** No manifest, or one naming a different folder: not an Antigravity plugin. */
  | { kind: 'skip' }
  | { kind: 'invalid'; detail: string };

/** A parsed `config.json`, or why it could not be read. */
type ConfigRead =
  | { kind: 'missing' }
  | { kind: 'invalid'; detail: string }
  | { kind: 'parsed'; config: unknown };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The workspace scope, then the user scope; workspace plugins are listed first. */
function scopesOf(env: EnabledPluginsEnv): PluginScope[] {
  return [
    { dir: path.join(env.projectDir, '.agents', 'plugins'), label: '.agents/plugins' },
    {
      dir: path.join(env.homeDir, '.gemini', 'config', 'plugins'),
      label: '~/.gemini/config/plugins',
    },
  ];
}

/** Names of the regular plugin folders in `dir`; a link is skipped, never followed. */
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

/** Whether the folder is an `agy plugin import claude` copy, which must never count. */
function isClaudeImport(folder: string): boolean {
  try {
    return (
      fs.lstatSync(path.join(folder, '.claude-plugin'), { throwIfNoEntry: false }) !== undefined
    );
  } catch {
    return false;
  }
}

/** The folder's `plugin.json`: its own manifest when it names `folderName`, else skipped. */
function readManifest(folder: string, folderName: string): ManifestState {
  const file = path.join(folder, 'plugin.json');
  try {
    // A folder without a manifest is not an Antigravity plugin; it is not a read problem.
    if (fs.lstatSync(file, { throwIfNoEntry: false }) === undefined) return { kind: 'skip' };
  } catch {
    // The read below reports the path problem as a warning.
  }
  const read = readRegularFile(file, { maxBytes: PLUGIN_JSON_MAX_BYTES });
  if ('reason' in read) return { kind: 'invalid', detail: read.reason };
  let manifest: unknown;
  try {
    manifest = JSON.parse(read.content);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { kind: 'invalid', detail };
  }
  if (!isPlainObject(manifest) || manifest.name !== folderName) return { kind: 'skip' };
  return { kind: 'ok' };
}

/** The file's parsed JSON, or why it is missing, unreadable or invalid. */
function readConfig(file: string): ConfigRead {
  try {
    if (fs.lstatSync(file, { throwIfNoEntry: false }) === undefined) return { kind: 'missing' };
  } catch {
    // The read below reports the path problem as a warning.
  }
  const read = readRegularFile(file, { maxBytes: CONFIG_MAX_BYTES });
  if ('reason' in read) return { kind: 'invalid', detail: read.reason };
  try {
    return { kind: 'parsed', config: JSON.parse(read.content) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { kind: 'invalid', detail };
  }
}

/** The plugin names a parsed config marks `enabled: false`; everything else counts as enabled. */
function disabledNames(config: unknown): Set<string> {
  const plugins =
    isPlainObject(config) && isPlainObject(config.plugins) ? config.plugins : undefined;
  if (plugins === undefined) return new Set();
  return new Set(
    Object.entries(plugins)
      .filter(([, entry]) => isPlainObject(entry) && entry.enabled === false)
      .map(([name]) => name),
  );
}

/** Whether `name`'s folder is one Antigravity plugin; a read problem is one warning. */
function countsAsPlugin(scope: PluginScope, name: string, warnings: string[]): boolean {
  const folder = path.join(scope.dir, name);
  if (isClaudeImport(folder)) return false;
  const manifest = readManifest(folder, name);
  if (manifest.kind === 'ok') return true;
  if (manifest.kind === 'invalid') {
    warnings.push(`${scope.label}/${name}/plugin.json: ${manifest.detail}`);
  }
  return false;
}

/** The installed plugins of every scope, workspace first and the first folder for a name winning. */
function installedPlugins(
  scopes: readonly PluginScope[],
  warnings: string[],
): Map<string, EnabledPlugin> {
  const found = new Map<string, EnabledPlugin>();
  for (const scope of scopes) {
    for (const name of pluginFolders(scope.dir, scope.label, warnings)) {
      if (found.has(name) || !countsAsPlugin(scope, name, warnings)) continue;
      found.set(name, { name, source: `${scope.label}/${name}` });
    }
  }
  return found;
}

/** The installed plugins of both scopes, workspace first, plus any read warnings. */
export function readAntigravityEnabledPlugins(env: EnabledPluginsEnv): EnabledPluginsResult {
  const warnings: string[] = [];
  const found = installedPlugins(scopesOf(env), warnings);
  const configFile = path.join(env.homeDir, '.gemini', 'config', 'config.json');
  const config = readConfig(configFile);
  if (config.kind === 'invalid') {
    warnings.push(`${homeDisplayPath(configFile, env.homeDir)}: ${config.detail}`);
  }
  const disabled = config.kind === 'parsed' ? disabledNames(config.config) : new Set<string>();
  const plugins = [...found.values()].filter(plugin => !disabled.has(plugin.name));
  return { plugins, warnings, marketplace: false };
}
