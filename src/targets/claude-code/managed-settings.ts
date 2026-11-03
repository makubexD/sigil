/**
 * The managed settings Claude Code reads from disk: `managed-settings.json` in the OS policy
 * directory, then each non-hidden `*.json` drop-in under `managed-settings.d/` in name order,
 * each later file overriding the earlier per `enabledPlugins` key. A managed `true`
 * force-enables a plugin and a managed `false` disables it, above every settings file. Only
 * files are read: server-managed, MDM and registry policy are not files sigil can read, so
 * they stay a documented limit.
 *
 * The policy directory is `/Library/Application Support/ClaudeCode` on macOS,
 * `C:\Program Files\ClaudeCode` on Windows and `/etc/claude-code` elsewhere; `env.systemDir`
 * replaces it in tests. A missing directory or file is silent. An unreadable, unparseable or
 * malformed file is one warning, and the other files (and the settings scopes) still apply.
 * Non-boolean entries are ignored.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { readRegularFile } from '../../safe-read';
import type { EnabledPluginsEnv } from '../../plugin-types';

const KIB = 1024;

/** A settings file is small; anything far larger is not one sigil should read. */
const MAX_SETTINGS_KIB = 1024;

/** The size cap for one settings file, shared with the settings-scope reader. */
export const SETTINGS_MAX_BYTES = MAX_SETTINGS_KIB * KIB;

const MANAGED_FILE = 'managed-settings.json';
const DROPIN_DIR = 'managed-settings.d';

const DARWIN_DIR = '/Library/Application Support/ClaudeCode';
const WINDOWS_DIR = 'C:\\Program Files\\ClaudeCode';
const OTHER_DIR = '/etc/claude-code';

/** One `enabledPlugins` key a managed file set. */
export interface ManagedPluginEntry {
  readonly value: boolean;
  /** `managed settings (<full path of the file that set the key>)`. */
  readonly source: string;
}

/** The keys the managed files set, and any read warnings. */
export interface ManagedEnabledPlugins {
  readonly entries: ReadonlyMap<string, ManagedPluginEntry>;
  readonly warnings: string[];
}

/** `managed settings (<file>)`, the source name and the warning prefix for one file. */
function managedSource(file: string): string {
  return `managed settings (${file})`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The OS policy directory, replaced by `env.systemDir` in tests. */
function managedDir(env: EnabledPluginsEnv): string {
  if (env.systemDir !== undefined) return env.systemDir;
  if (process.platform === 'darwin') return DARWIN_DIR;
  if (process.platform === 'win32') return WINDOWS_DIR;
  return OTHER_DIR;
}

/** Non-hidden `*.json` names under the drop-in directory, sorted; a missing directory is silent. */
function listDropIns(dropIn: string, warnings: string[]): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(dropIn);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      warnings.push(`${managedSource(dropIn)}: ${errorMessage(error)}`);
    }
    return [];
  }
  return names.filter(name => !name.startsWith('.') && name.endsWith('.json')).sort();
}

/** The managed files in precedence order: the base file first, then the drop-ins by name. */
function managedFiles(dir: string, warnings: string[]): string[] {
  const dropIn = path.join(dir, DROPIN_DIR);
  const dropIns = listDropIns(dropIn, warnings).map(name => path.join(dropIn, name));
  return [path.join(dir, MANAGED_FILE), ...dropIns];
}

/** Parses a settings file, warning once (and returning undefined) when it is not a JSON object. */
function parseSettings(
  file: string,
  content: string,
  warnings: string[],
): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(content);
    if (isPlainObject(parsed)) return parsed;
    warnings.push(`${managedSource(file)}: not a JSON object`);
  } catch (error) {
    warnings.push(`${managedSource(file)}: not valid JSON (${errorMessage(error)})`);
  }
  return undefined;
}

/** The file's `enabledPlugins` object; one warning when it is present but not an object. */
function parseEntries(
  file: string,
  content: string,
  warnings: string[],
): Record<string, unknown> | undefined {
  const settings = parseSettings(file, content, warnings);
  if (settings === undefined) return undefined;
  const enabled = settings.enabledPlugins;
  if (enabled === undefined) return undefined;
  if (isPlainObject(enabled)) return enabled;
  warnings.push(`${managedSource(file)}: enabledPlugins is not an object`);
  return undefined;
}

/** One managed file's entries, or undefined when it is missing or unusable. */
function readEntries(file: string, warnings: string[]): Record<string, unknown> | undefined {
  try {
    if (fs.lstatSync(file, { throwIfNoEntry: false }) === undefined) return undefined;
  } catch (error) {
    warnings.push(`${managedSource(file)}: ${errorMessage(error)}`);
    return undefined;
  }
  const read = readRegularFile(file, { maxBytes: SETTINGS_MAX_BYTES });
  if ('reason' in read) {
    warnings.push(`${managedSource(file)}: ${read.reason}`);
    return undefined;
  }
  return parseEntries(file, read.content, warnings);
}

/** Adds one file's boolean entries, overriding keys an earlier file set. */
function mergeFile(
  file: string,
  entries: Map<string, ManagedPluginEntry>,
  warnings: string[],
): void {
  const enabledPlugins = readEntries(file, warnings);
  if (enabledPlugins === undefined) return;
  for (const [key, value] of Object.entries(enabledPlugins)) {
    if (typeof value !== 'boolean') continue;
    entries.set(key, { value, source: managedSource(file) });
  }
}

/** The merged managed `enabledPlugins` entries, and the warnings met while reading them. */
export function readManagedEnabledPlugins(env: EnabledPluginsEnv): ManagedEnabledPlugins {
  const warnings: string[] = [];
  const entries = new Map<string, ManagedPluginEntry>();
  for (const file of managedFiles(managedDir(env), warnings)) {
    mergeFile(file, entries, warnings);
  }
  return { entries, warnings };
}
