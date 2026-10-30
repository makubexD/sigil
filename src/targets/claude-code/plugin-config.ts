/**
 * Generates one Claude Code plugin per config-kind artifact — `hook-<basename>` and
 * `mcp-<basename>` — so a pack plugin never carries `hooks/hooks.json` or `.mcp.json`
 * (distribution ADR, Phase C decision 1). Each plugin reuses the scaffold path's own
 * builders: `hookFragment` for hooks and `portableMcpServer` for MCP, so a plugin user gets
 * exactly what `sigil add` writes.
 *
 * @module
 */
import type { CompileOptions, FileMap, Pack, ResolvedArtifact, ResolvedCatalog } from '../../types';
import { JSON_INDENT } from '../../json-util';
import { artifactTargetsPlatform } from '../../select';
import { envTokenNames } from '../env-reference';
import { PORTABLE_MCP_SERVERS_KEY, portableMcpServer } from '../portable-mcp';
import { hookFragment } from './config-scaffold';
import { buildPluginJson } from './plugin-assemble';
import { configPluginName } from './plugin-build';
import { buildPluginEntry, type PluginEntry } from './target-helpers';

/** Options the manifest builders read; `packs` is irrelevant to a generated config plugin. */
type ConfigPluginOptions = Pick<CompileOptions, 'version' | 'homepage' | 'marketplace'>;

/** One generated config plugin: its files and its marketplace entry. */
export interface ConfigPlugin {
  files: FileMap;
  entry: PluginEntry;
}

/** Kinds that get one generated plugin each, in marketplace order. */
const CONFIG_PLUGIN_KINDS = ['hook', 'mcp'] as const;

/**
 * The catalog description, plus the environment variables an MCP server needs: nothing warns a
 * plugin user about an unset `${NAME}`, so the description names them (decision 4).
 */
function configDescription(artifact: ResolvedArtifact): string {
  const description = (artifact.frontmatter.description as string | undefined) ?? '';
  if (artifact.kind !== 'mcp') return description;
  const names = envTokenNames(artifact.frontmatter.server);
  if (names.length === 0) return description;
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  const noun = names.length === 1 ? 'variable' : 'variables';
  return `${description} Requires the environment ${noun} ${list}.`;
}

/** A synthetic pack so a config plugin reuses the pack manifest and marketplace entry builders. */
function configPack(artifact: ResolvedArtifact): Pack {
  return {
    name: configPluginName(artifact),
    displayName: (artifact.frontmatter.title as string | undefined) ?? artifact.id,
    description: configDescription(artifact),
  };
}

/** The one config file a generated plugin carries, ending in a newline like every JSON writer. */
function configFileContent(artifact: ResolvedArtifact): string {
  if (artifact.kind === 'hook') {
    return JSON.stringify(hookFragment(artifact.frontmatter), null, JSON_INDENT) + '\n';
  }
  const { name, config } = portableMcpServer(artifact);
  const body = { [PORTABLE_MCP_SERVERS_KEY]: { [name]: config } };
  return JSON.stringify(body, null, JSON_INDENT) + '\n';
}

/** The output path the config file lands on inside the plugin folder. */
function configFilePath(artifact: ResolvedArtifact): string {
  return artifact.kind === 'hook' ? 'hooks/hooks.json' : '.mcp.json';
}

/** Builds one artifact's plugin: its manifest and its single config file. */
function buildOneConfigPlugin(
  artifact: ResolvedArtifact,
  catalog: ResolvedCatalog,
  options: ConfigPluginOptions,
): ConfigPlugin {
  const pack = configPack(artifact);
  const prefix = `plugins/${pack.name}`;
  const files: FileMap = {
    [`${prefix}/.claude-plugin/plugin.json`]: buildPluginJson(pack, {
      pack,
      packArtifacts: [],
      catalog,
      ...options,
    }),
    [`${prefix}/${configFilePath(artifact)}`]: configFileContent(artifact),
  };
  return { files, entry: buildPluginEntry(pack) };
}

/**
 * One plugin per `hook` and `mcp` artifact whose `platforms:` allows Claude (an absent list
 * allows every target). The marketplace lists them after the pack plugins, never in `packs.yaml`.
 */
export function buildConfigPlugins(
  catalog: ResolvedCatalog,
  options: ConfigPluginOptions,
): ConfigPlugin[] {
  const plugins: ConfigPlugin[] = [];
  for (const kind of CONFIG_PLUGIN_KINDS) {
    for (const artifact of catalog.artifacts) {
      if (artifact.kind !== kind || !artifactTargetsPlatform(artifact, 'claude')) continue;
      plugins.push(buildOneConfigPlugin(artifact, catalog, options));
    }
  }
  return plugins;
}
