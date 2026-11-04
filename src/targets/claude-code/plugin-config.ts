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
import { SigilError } from '../../errors';
import { declaredVarNames, substituteVars } from '../../mcp-vars';
import { artifactTargetsPlatform } from '../../select';
import { envTokenNames } from '../env-reference';
import { PORTABLE_MCP_SERVERS_KEY, portableMcpServer } from '../portable-mcp';
import { hookFragment } from './config-scaffold';
import { buildPluginJson, type PluginUserConfigEntry } from './plugin-assemble';
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
 * The sentence every generated hook and MCP plugin description ends with: these plugins exist only
 * for Claude Code, and a Copilot user browses the same marketplace.
 */
const CLAUDE_ONLY_SUFFIX = 'As a plugin, this is for Claude Code only.';

/**
 * The catalog description, plus the environment variables an MCP server needs: nothing warns a
 * plugin user about an unset `${NAME}`, so the description names them (decision 4). Every config
 * plugin then ends with the Claude-only sentence.
 */
function configDescription(artifact: ResolvedArtifact): string {
  const description = artifact.frontmatter.description as string;
  if (artifact.kind !== 'mcp') return `${description} ${CLAUDE_ONLY_SUFFIX}`;
  const names = envTokenNames(artifact.frontmatter.server);
  if (names.length === 0) return `${description} ${CLAUDE_ONLY_SUFFIX}`;
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  const noun = names.length === 1 ? 'variable' : 'variables';
  return `${description} Requires the environment ${noun} ${list}. ${CLAUDE_ONLY_SUFFIX}`;
}

/** A synthetic pack so a config plugin reuses the pack manifest and marketplace entry builders. */
function configPack(artifact: ResolvedArtifact): Pack {
  return {
    name: configPluginName(artifact),
    displayName: artifact.frontmatter.title as string,
    description: configDescription(artifact),
  };
}

/** Whether `value` is a plain object, for narrowing the frontmatter's `unknown` fields. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** One `userConfig` entry, narrowed from the artifact's `unknown` frontmatter value. */
function userConfigEntry(artifactId: string, name: string, spec: unknown): PluginUserConfigEntry {
  if (
    !isRecord(spec) ||
    typeof spec['title'] !== 'string' ||
    typeof spec['description'] !== 'string'
  ) {
    throw new SigilError(
      `mcp artifact '${artifactId}': vars.${name} needs a title and a description`,
    );
  }
  return {
    type: 'string',
    title: spec['title'],
    description: spec['description'],
    required: true,
  };
}

/**
 * `plugin.json`'s `userConfig`: one required string prompt per declared `vars:` name, in declared
 * order. Undefined when the artifact declares none, so a no-vars manifest keeps its bytes.
 */
function pluginUserConfig(
  artifact: ResolvedArtifact,
): Record<string, PluginUserConfigEntry> | undefined {
  const names = declaredVarNames(artifact);
  if (names.length === 0) return undefined;
  const vars = artifact.frontmatter['vars'];
  if (!isRecord(vars)) return undefined;
  return Object.fromEntries(
    names.map(name => [name, userConfigEntry(artifact.id, name, vars[name])] as const),
  );
}

/**
 * The one config file a generated plugin carries, ending in a newline like every JSON writer.
 * An MCP server's install-time vars become `${user_config.NAME}` references, which Claude fills
 * from the plugin manifest's `userConfig` prompt; the catalog artifact stays untouched.
 */
function configFileContent(artifact: ResolvedArtifact): string {
  if (artifact.kind === 'hook') {
    return JSON.stringify(hookFragment(artifact.frontmatter), null, JSON_INDENT) + '\n';
  }
  const server = substituteVars(
    artifact.frontmatter['server'],
    name => '${user_config.' + name + '}',
  );
  const { name, config } = portableMcpServer({
    ...artifact,
    frontmatter: { ...artifact.frontmatter, server },
  });
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
      userConfig: pluginUserConfig(artifact),
    }),
    [`${prefix}/${configFilePath(artifact)}`]: configFileContent(artifact),
  };
  return { files, entry: buildPluginEntry(pack) };
}

/**
 * Every `hook` and `mcp` artifact whose `platforms:` allows Claude (an absent list allows every
 * target), in marketplace order: all hooks, then all MCP servers. The marketplace lists a
 * generated plugin for each, after the pack plugins, never in `packs.yaml`.
 */
export function configPluginArtifacts(catalog: ResolvedCatalog): ResolvedArtifact[] {
  const artifacts: ResolvedArtifact[] = [];
  for (const kind of CONFIG_PLUGIN_KINDS) {
    for (const artifact of catalog.artifacts) {
      if (artifact.kind === kind && artifactTargetsPlatform(artifact, 'claude')) {
        artifacts.push(artifact);
      }
    }
  }
  return artifacts;
}

/** One plugin per generated config artifact, in {@link configPluginArtifacts} order. */
export function buildConfigPlugins(
  catalog: ResolvedCatalog,
  options: ConfigPluginOptions,
): ConfigPlugin[] {
  return configPluginArtifacts(catalog).map(artifact =>
    buildOneConfigPlugin(artifact, catalog, options),
  );
}
