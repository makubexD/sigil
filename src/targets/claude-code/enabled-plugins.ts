/**
 * Which Claude Code marketplace plugins are enabled, read from the `enabledPlugins` setting.
 * Precedence follows Claude's settings scopes, highest first: local (`.claude/settings.local.json`),
 * project (`.claude/settings.json`), user (`~/.claude/settings.json`). The highest scope that sets a
 * key decides, and only an explicit `true` counts — a plugin with no entry at any scope is not
 * counted, because whether it is installed lives in files the docs do not describe. Managed settings
 * are not read.
 *
 * Files are read through src/safe-read.ts like every other sigil read; a missing file is skipped
 * silently, a refused or unparseable one is reported as a warning and the other scopes still read.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { readRegularFile } from '../../safe-read';
import type { EnabledPlugin, EnabledPluginsEnv, EnabledPluginsResult } from '../../types';

const KIB = 1024;

/** A settings file is small; anything far larger is not one sigil should read. */
const MAX_SETTINGS_KIB = 1024;

interface SettingsScope {
  /** Absolute path of the file. */
  readonly file: string;
  /** How this module names the file in `EnabledPlugin.source` and in warnings. */
  readonly source: string;
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
    {
      file: path.join(env.homeDir, '.claude', 'settings.json'),
      source: '~/.claude/settings.json',
    },
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

/** The file's `enabledPlugins` object, or undefined when the file is missing or has no usable one. */
function readScope(scope: SettingsScope, warnings: string[]): Record<string, unknown> | undefined {
  // A missing file is the normal case; only a file that exists and can't be used is reported.
  if (fs.lstatSync(scope.file, { throwIfNoEntry: false }) === undefined) return undefined;

  const read = readRegularFile(scope.file, { maxBytes: MAX_SETTINGS_KIB * KIB });
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

/** Enabled plugins from `env.marketplace`, sorted by name, plus any read warnings. */
export function readClaudeEnabledPlugins(env: EnabledPluginsEnv): EnabledPluginsResult {
  const warnings: string[] = [];
  const decided = new Map<string, EnabledPlugin & { enabled: boolean }>();

  for (const scope of settingsScopes(env)) {
    const enabledPlugins = readScope(scope, warnings);
    if (enabledPlugins === undefined) continue;
    for (const [key, value] of Object.entries(enabledPlugins)) {
      if (decided.has(key)) continue;
      const name = pluginName(key, env.marketplace);
      if (name === undefined) continue;
      decided.set(key, { name, source: scope.source, enabled: value === true });
    }
  }

  const plugins: EnabledPlugin[] = [...decided.values()]
    .filter(entry => entry.enabled)
    .map(({ name, source }) => ({ name, source }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return { plugins, warnings };
}
