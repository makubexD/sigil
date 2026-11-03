/**
 * Assembles the Antigravity plugin build: one folder per pack holding its skills, agents and
 * rules, each with a root `plugin.json` (./plugin-manifest.ts), plus one generated plugin per hook
 * and MCP artifact (./plugin-config.ts). Every member file is written through its plugin-channel
 * spec (../emit-files.ts).
 *
 * Config kinds never join a pack plugin, so installing a pack never adds a hook or an MCP server.
 * A pack with no member the plugin channel can write — no skill, agent or repo-wide rule — gets
 * no plugin folder at all.
 *
 * @module
 */
import type { CompileOptions, FileMap, Pack, ResolvedArtifact, ResolvedCatalog } from '../../types';
import { SigilError } from '../../errors';
import { specSkipReason } from '../tool-restriction';
import { emitFile, specFor } from '../emit-files';
import type { EmitContext } from '../spec-types';
import { computeSharedAgentIds, getPackArtifacts } from '../shared/plugin-packs';
import { ANTIGRAVITY_EMIT_SPECS } from './spec';
import { antigravityPluginJson } from './plugin-manifest';
import { buildAntigravityConfigPlugins } from './plugin-config';

/** Whether the plugin channel writes `artifact`: it has a plugin spec that refuses nothing. */
export function isWritable(artifact: ResolvedArtifact): boolean {
  const spec = specFor(ANTIGRAVITY_EMIT_SPECS, artifact.kind, 'plugin');
  return spec !== undefined && specSkipReason(spec, artifact) === undefined;
}

/**
 * Writes a pack's skills, agents, rules and shared agents through their plugin-channel specs.
 * `ctx` carries the pack name (paths under `plugins/<pack>/`) and the pack's install set, which
 * drives each file's conditional Boundary section.
 *
 * Two different members whose spec resolves to the same output path fail the build: a plugin
 * folder has no per-kind namespace for a duplicate name, so one would silently overwrite the
 * other. The same artifact id written twice stays legal: a pack may list one twice.
 */
function writeMemberFiles(
  members: readonly ResolvedArtifact[],
  ctx: EmitContext,
  files: FileMap,
): void {
  const writtenBy = new Map<string, string>();
  for (const artifact of members) {
    const spec = specFor(ANTIGRAVITY_EMIT_SPECS, artifact.kind, 'plugin');
    // A member its spec skips writes nothing, so it can't collide with anything.
    if (!spec || specSkipReason(spec, artifact) !== undefined) continue;
    const filePath = spec.outputPath(artifact, ctx);
    const otherId = writtenBy.get(filePath);
    if (otherId !== undefined && otherId !== artifact.id) {
      throw new SigilError(
        `plugin '${ctx.packName}': ${artifact.id} and ${otherId} both write ${filePath}`,
      );
    }
    writtenBy.set(filePath, artifact.id);
    emitFile(spec, artifact, ctx, files);
  }
}

/**
 * A pack's members (its skills, agents and rules, plus the shared agents its skills use) and its
 * co-install set, which drives each file's conditional Boundary section.
 */
export function packMembers(
  pack: Pack,
  catalog: ResolvedCatalog,
): { members: ResolvedArtifact[]; installSet: Set<string> } {
  const packArtifacts = getPackArtifacts(pack, catalog);
  const skills = packArtifacts.filter(a => a.kind === 'skill');
  const agents = packArtifacts.filter(a => a.kind === 'agent');
  const rules = packArtifacts.filter(a => a.kind === 'rule');

  const installSet = new Set<string>(packArtifacts.map(a => a.id));
  const excluded = new Set(pack.pluginExclude ?? []);
  const sharedAgentIds = computeSharedAgentIds(skills, agents, excluded, installSet);
  const sharedAgents = [...sharedAgentIds].flatMap(id => catalog.byId.get(id) ?? []);
  return { members: [...skills, ...agents, ...rules, ...sharedAgents], installSet };
}

/**
 * One pack's plugin: its manifest plus its members, or `undefined` when the pack holds nothing the
 * plugin channel can write (only config artifacts, or only rules its spec skips).
 */
function buildPackPlugin(
  pack: Pack,
  catalog: ResolvedCatalog,
  options: CompileOptions,
): FileMap | undefined {
  const { members, installSet } = packMembers(pack, catalog);
  if (!members.some(isWritable)) return undefined;

  const files: FileMap = {
    [`plugins/${pack.name}/plugin.json`]: antigravityPluginJson(pack, options),
  };
  const ctx: EmitContext = { catalog, installSet, packName: pack.name };
  writeMemberFiles(members, ctx, files);
  return files;
}

/**
 * Adds one generated plugin per hook and MCP artifact. A generated name already in `taken` (a pack,
 * or another generated plugin: `shared/x` and `python/x` share a basename) fails the build, since
 * one folder would otherwise overwrite another.
 */
function addConfigPlugins(
  catalog: ResolvedCatalog,
  options: CompileOptions,
  taken: Set<string>,
  files: FileMap,
): void {
  for (const plugin of buildAntigravityConfigPlugins(catalog, options)) {
    if (taken.has(plugin.name)) {
      throw new SigilError(
        `generated config plugin '${plugin.name}' collides with a pack or another generated plugin of the same name`,
      );
    }
    taken.add(plugin.name);
    Object.assign(files, plugin.files);
  }
}

/**
 * Builds the complete Antigravity plugin FileMap: every pack's plugin, then one generated plugin
 * per hook and MCP artifact (`hook-<basename>` / `mcp-<basename>`). Two packs with one name fail
 * the build, since their plugins would share a folder.
 */
export function buildAntigravityPlugins(
  catalog: ResolvedCatalog,
  options: CompileOptions,
): FileMap {
  const files: FileMap = {};
  const packNames = new Set<string>();
  for (const pack of options.packs) {
    if (packNames.has(pack.name)) {
      throw new SigilError(`two packs are named '${pack.name}'; each plugin needs its own folder`);
    }
    packNames.add(pack.name);
    const plugin = buildPackPlugin(pack, catalog, options);
    if (plugin) Object.assign(files, plugin);
  }
  addConfigPlugins(catalog, options, packNames, files);
  return files;
}
