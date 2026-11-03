/**
 * Which Claude Code marketplace plugins are enabled, read from the `enabledPlugins` setting.
 * Precedence follows Claude's settings scopes, highest first: file-based managed settings
 * (`managed-settings.json`, then `managed-settings.d/*.json`; see managed-settings.ts), local
 * (`.claude/settings.local.json`), project (`.claude/settings.json`), user
 * (`$CLAUDE_CONFIG_DIR/settings.json` when that variable is non-empty, else
 * `~/.claude/settings.json`). The highest scope that sets a key decides, and only an explicit
 * `true` counts — a plugin with no entry at any scope is not counted, because whether it is
 * installed lives in files the docs do not describe. Server-managed, MDM and registry policy
 * are not files sigil can read, so they are not covered.
 *
 * Files are read through src/safe-read.ts like every other sigil read; a missing file is skipped
 * silently, a refused or unparseable one is reported as a warning and the other scopes still read.
 * A user-scope settings file that is a symbolic link is resolved and read at its target (dotfile
 * managers link it), with the same size cap; project and local links stay refused.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { readRegularFile } from '../../safe-read';
import type { EnabledPlugin, EnabledPluginsEnv, EnabledPluginsResult } from '../../types';
import { readManagedEnabledPlugins, SETTINGS_MAX_BYTES } from './managed-settings';

interface SettingsScope {
  /** Absolute path of the file. */
  readonly file: string;
  /** How this module names the file in `EnabledPlugin.source` and in warnings. */
  readonly source: string;
  /** Resolve a symbolic link before reading; only the user scope does. */
  readonly followLinks?: boolean;
}

/** `file` named with `homeDir` as `~`, so a moved user scope still reads as a home path. */
function displayPath(file: string, homeDir: string): string {
  const prefix = homeDir.endsWith(path.sep) ? homeDir : `${homeDir}${path.sep}`;
  return file.startsWith(prefix) ? `~${file.slice(homeDir.length)}` : file;
}

/** The user scope, moved by a non-empty `CLAUDE_CONFIG_DIR` as Claude Code moves it. */
function userScope(env: EnabledPluginsEnv): SettingsScope {
  const configDir = (env.vars ?? process.env).CLAUDE_CONFIG_DIR;
  const file =
    configDir !== undefined && configDir.length > 0
      ? path.join(configDir, 'settings.json')
      : path.join(env.homeDir, '.claude', 'settings.json');
  return { file, source: displayPath(file, env.homeDir), followLinks: true };
}

/** The scopes in precedence order, highest first. */
function settingsScopes(env: EnabledPluginsEnv): SettingsScope[] {
  return [
    {
      file: path.join(env.projectDir, '.claude', 'settings.local.json'),
      source: '.claude/settings.local.json',
    },
    {
      file: path.join(env.projectDir, '.claude', 'settings.json'),
      source: '.claude/settings.json',
    },
    userScope(env),
  ];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parses settings text; undefined (with a warning) when it is not a JSON object. */
function parseSettings(
  scope: SettingsScope,
  content: string,
  warnings: string[],
): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(content);
    return isPlainObject(parsed) ? parsed : undefined;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    warnings.push(`${scope.source}: not valid JSON (${detail})`);
    return undefined;
  }
}

/** ENOTDIR: a path component (the project's `.claude`) is a file, so nothing under it can be read. */
function isNotDirectory(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOTDIR';
}

/**
 * Whether the scope's directory can hold the file. It is checked explicitly, because under a
 * regular file Windows reports ENOENT where POSIX reports ENOTDIR, and `throwIfNoEntry` would hide
 * it. `stat` follows a symlinked `.claude`, which reads as before.
 */
function dirHoldsFiles(dir: string, scope: SettingsScope, warnings: string[]): boolean {
  const stats = fs.statSync(dir, { throwIfNoEntry: false });
  if (stats === undefined || stats.isDirectory()) return stats !== undefined;
  warnings.push(`${scope.source}: ${dir} is not a directory`);
  return false;
}

/**
 * Whether the scope is worth reading: a missing file is not, and a path error (EACCES, ENOTDIR,
 * …) is reported once per directory rather than once per settings file under it.
 */
function scopeReadable(
  scope: SettingsScope,
  warnings: string[],
  unreadableDirs: Set<string>,
): boolean {
  const dir = path.dirname(scope.file);
  if (unreadableDirs.has(dir)) return false;

  try {
    if (!dirHoldsFiles(dir, scope, warnings)) {
      unreadableDirs.add(dir);
      return false;
    }
    return fs.lstatSync(scope.file, { throwIfNoEntry: false }) !== undefined;
  } catch (error) {
    if (isNotDirectory(error)) unreadableDirs.add(dir);
    const detail = error instanceof Error ? error.message : String(error);
    warnings.push(`${scope.source}: ${detail}`);
    return false;
  }
}

/**
 * The path to read for a scope: the user scope follows a symbolic link, other scopes leave it to
 * `readRegularFile` to refuse. A broken link is one warning.
 */
function scopeFileToRead(scope: SettingsScope, warnings: string[]): string | undefined {
  if (scope.followLinks !== true) return scope.file;
  const stats = fs.lstatSync(scope.file, { throwIfNoEntry: false });
  if (stats === undefined || !stats.isSymbolicLink()) return scope.file;
  try {
    return fs.realpathSync(scope.file);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    warnings.push(`${scope.source}: ${detail}`);
    return undefined;
  }
}

/** The file's `enabledPlugins` object, or undefined when the file is missing or has no usable one. */
function readScope(
  scope: SettingsScope,
  warnings: string[],
  unreadableDirs: Set<string>,
): Record<string, unknown> | undefined {
  if (!scopeReadable(scope, warnings, unreadableDirs)) return undefined;

  const file = scopeFileToRead(scope, warnings);
  if (file === undefined) return undefined;

  const read = readRegularFile(file, { maxBytes: SETTINGS_MAX_BYTES });
  if ('reason' in read) {
    warnings.push(`${scope.source}: ${read.reason}`);
    return undefined;
  }

  const enabled = parseSettings(scope, read.content, warnings)?.enabledPlugins;
  return isPlainObject(enabled) ? enabled : undefined;
}

/** The plugin name in a `<name>@<marketplace>` key, or undefined for another marketplace. */
function pluginName(key: string, marketplace: string): string | undefined {
  const suffix = `@${marketplace}`;
  if (!key.endsWith(suffix)) return undefined;
  const name = key.slice(0, -suffix.length);
  return name.length > 0 ? name : undefined;
}

/**
 * Managed settings decide before every settings file, so their keys are recorded first: a
 * managed `false` beats a local or project `true`, and a managed `true` beats a lower `false`.
 */
function seedManaged(
  env: EnabledPluginsEnv,
  decided: Map<string, EnabledPlugin & { enabled: boolean }>,
  warnings: string[],
): void {
  const managed = readManagedEnabledPlugins(env);
  warnings.push(...managed.warnings);
  for (const [key, entry] of managed.entries) {
    const name = pluginName(key, env.marketplace);
    if (name !== undefined) decided.set(key, { name, source: entry.source, enabled: entry.value });
  }
}

/** The enabled entries as the result's plugin list, sorted by name. */
function sortedPlugins(
  decided: Map<string, EnabledPlugin & { enabled: boolean }>,
): EnabledPlugin[] {
  return [...decided.values()]
    .filter(entry => entry.enabled)
    .map(({ name, source }) => ({ name, source }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Enabled plugins from `env.marketplace`, sorted by name, plus any read warnings. */
export function readClaudeEnabledPlugins(env: EnabledPluginsEnv): EnabledPluginsResult {
  const warnings: string[] = [];
  const decided = new Map<string, EnabledPlugin & { enabled: boolean }>();
  const unreadableDirs = new Set<string>();
  seedManaged(env, decided, warnings);

  for (const scope of settingsScopes(env)) {
    const enabledPlugins = readScope(scope, warnings, unreadableDirs);
    if (enabledPlugins === undefined) continue;
    for (const [key, value] of Object.entries(enabledPlugins)) {
      if (decided.has(key)) continue;
      const name = pluginName(key, env.marketplace);
      if (name === undefined) continue;
      decided.set(key, { name, source: scope.source, enabled: value === true });
    }
  }

  return { plugins: sortedPlugins(decided), warnings };
}
