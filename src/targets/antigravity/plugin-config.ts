/**
 * Generates one Antigravity plugin per config-kind artifact — `hook-<basename>` and
 * `mcp-<basename>` — so installing a pack never adds a hook or an MCP server (phase F
 * decision 6). Each plugin reuses the scaffold path's own op builders through the target's
 * `ANTIGRAVITY_CONFIG_KINDS` table, so its config file holds exactly the fragment `sigil add`
 * merges into `.agents/`:
 *
 *   hook → plugins/<name>/hooks.json       (the `.agents/hooks.json` fragment)
 *   mcp  → plugins/<name>/mcp_config.json  (the `.agents/mcp_config.json` fragment)
 *
 * An MCP server inherits `agy`'s environment in a plugin (probe F1f), so `mcp_config.json`
 * carries no `variables` key. Antigravity registers the server as `<plugin>_<key>`.
 *
 * @module
 */
import { applyMerge } from '../../config-merge/apply';
import { serialize } from '../../config-merge/primitives';
import { declaredVarNames } from '../../mcp-vars';
import { artifactTargetsPlatform } from '../../select';
import type { FileMap, Pack, ResolvedArtifact, ResolvedCatalog } from '../../types';
import type { ConfigKindWriter } from '../config-kind-table';
import { envTokenNames } from '../env-reference';
import { configPluginName } from '../shared/plugin-packs';
import { ANTIGRAVITY_CONFIG_KINDS } from './config';
import { antigravityPluginJson, type AntigravityPluginOptions } from './plugin-manifest';

/** One generated config plugin: its name and the files under `plugins/<name>/`. */
export interface AntigravityConfigPlugin {
  name: string;
  files: FileMap;
}

/** Kinds that get one generated plugin each, in catalog order. */
const CONFIG_PLUGIN_KINDS = ['hook', 'mcp'] as const;

/** The kind's config writer, or undefined for an artifact that is not a config kind. */
function configWriterFor(artifact: ResolvedArtifact): ConfigKindWriter | undefined {
  if (artifact.kind !== 'hook' && artifact.kind !== 'mcp') return undefined;
  return ANTIGRAVITY_CONFIG_KINDS[artifact.kind];
}

/**
 * Whether a config plugin can carry `artifact`. A server with install variables can't: a plugin has
 * no install step and Antigravity asks for nothing on enable, so the value has no source. `sigil add`
 * still installs it.
 */
function deliverable(writer: ConfigKindWriter, artifact: ResolvedArtifact): boolean {
  return (
    artifactTargetsPlatform(artifact, 'antigravity') &&
    writer.skipReason?.(artifact) === undefined &&
    declaredVarNames(artifact).length === 0
  );
}

/**
 * The catalog description, plus the environment variables an MCP server needs: nothing warns a
 * plugin user about an unset variable, so the description names them (decision 6).
 */
function configDescription(artifact: ResolvedArtifact): string {
  const description = artifact.frontmatter.description as string;
  if (artifact.kind !== 'mcp') return description;
  const names = envTokenNames(artifact.frontmatter.server);
  if (names.length === 0) return description;
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  const noun = names.length === 1 ? 'variable' : 'variables';
  return `${description} Requires the environment ${noun} ${list}.`;
}

/** A synthetic pack so a config plugin reuses the pack manifest builder. */
function configPack(artifact: ResolvedArtifact): Pack {
  return {
    name: configPluginName(artifact),
    displayName: artifact.frontmatter.title as string,
    description: configDescription(artifact),
  };
}

/** The config file's name inside the plugin folder: `hooks.json` or `mcp_config.json`. */
function configFileName(artifact: ResolvedArtifact): string {
  return artifact.kind === 'hook' ? 'hooks.json' : 'mcp_config.json';
}

/** Every op the scaffold install folds into a fresh object, serialized as the plugin's file. */
function configContent(writer: ConfigKindWriter, artifact: ResolvedArtifact): string {
  const merged = writer
    .buildOps(artifact, 'project')
    .reduce<Record<string, unknown>>((existing, op) => applyMerge(existing, op), {});
  return serialize(merged);
}

/** One artifact's plugin, or undefined when Antigravity does not deliver an artifact. */
function buildOne(
  artifact: ResolvedArtifact,
  options: AntigravityPluginOptions,
): AntigravityConfigPlugin | undefined {
  const writer = configWriterFor(artifact);
  if (!writer || !deliverable(writer, artifact)) return undefined;
  const pack = configPack(artifact);
  const prefix = `plugins/${pack.name}`;
  return {
    name: pack.name,
    files: {
      [`${prefix}/plugin.json`]: antigravityPluginJson(pack, options),
      [`${prefix}/${configFileName(artifact)}`]: configContent(writer, artifact),
    },
  };
}

/**
 * Every `hook` and `mcp` artifact that gets a generated plugin, in build order: hooks first, then
 * MCP servers, each kind in catalog order. An artifact whose `platforms:` excludes Antigravity
 * (an absent list allows every target), whose skip reason refuses it, or that declares install
 * variables is left out.
 */
export function antigravityConfigPluginArtifacts(catalog: ResolvedCatalog): ResolvedArtifact[] {
  const artifacts: ResolvedArtifact[] = [];
  for (const kind of CONFIG_PLUGIN_KINDS) {
    for (const artifact of catalog.artifacts) {
      if (artifact.kind !== kind) continue;
      const writer = configWriterFor(artifact);
      if (!writer || !deliverable(writer, artifact)) continue;
      artifacts.push(artifact);
    }
  }
  return artifacts;
}

/** One plugin per config artifact in {@link antigravityConfigPluginArtifacts} order. */
export function buildAntigravityConfigPlugins(
  catalog: ResolvedCatalog,
  options: AntigravityPluginOptions,
): AntigravityConfigPlugin[] {
  return antigravityConfigPluginArtifacts(catalog)
    .map(artifact => buildOne(artifact, options))
    .filter((plugin): plugin is AntigravityConfigPlugin => plugin !== undefined);
}
