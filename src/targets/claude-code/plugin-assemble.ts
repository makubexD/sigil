/**
 * Assembles a pack's full plugin FileMap: plugin.json, plus its skills, agents and workflows
 * written through their plugin-channel specs (../emit-files.ts).
 *
 * @module
 */
import type { ResolvedCatalog, ResolvedArtifact, FileMap, Pack } from '../../types';
import { JSON_INDENT } from '../../json-util';
import { CLAUDE_EMIT_SPECS } from './spec';
import { emitFile, specFor } from '../emit-files';
import type { EmitContext } from '../spec-types';
import type { ArtifactKind } from '../../types';
import { nativeKinds } from '../capabilities';
import { CLAUDE_CAPABILITIES } from './capabilities';
import type { TargetCapabilities } from '../capability-types';

/** Build the `plugin.json` manifest content for a pack. */
function buildPluginJson(pack: Pack, version: string, homepage: string | undefined): string {
  const pluginUrl = homepage ?? 'https://github.com/makubexD/sigil#readme';
  return (
    JSON.stringify(
      {
        $schema: 'https://json.schemastore.org/claude-code-plugin-manifest.json',
        name: pack.name,
        displayName: pack.displayName,
        version,
        description: pack.description,
        author: { name: 'Sigil', url: pluginUrl },
        license: 'MIT',
        keywords: pack.languages ?? [],
      },
      null,
      JSON_INDENT,
    ) + '\n'
  );
}

/**
 * Compute the shared-agent ids referenced by `skills` that aren't already part of `agents`,
 * and add them to `packInstallSet` (mutated in place) so each file's conditional Boundary
 * section sees them as co-present.
 */
function computeSharedAgentIds(
  skills: ResolvedArtifact[],
  agents: ResolvedArtifact[],
  packInstallSet: Set<string>,
): Set<string> {
  // Set lookup instead of agents.some() per (skill, resolvedAgentId) pair below — was
  // O(skills * resolvedAgentIds * agents); fixed in the 2026-08-26 round after a dogfooded
  // ts-performance-profiler run flagged it (see docs/audits/2026-08-25/register.md's backlog).
  const agentIds = new Set(agents.map(a => a.id));
  const sharedAgentIds = new Set<string>();
  for (const skill of skills) {
    for (const agentId of skill.resolvedAgentIds ?? []) {
      if (!agentIds.has(agentId)) {
        sharedAgentIds.add(agentId);
        packInstallSet.add(agentId);
      }
    }
  }
  return sharedAgentIds;
}

/**
 * Writes the pack's workflows, skills and agents (plus the shared agents its skills use) through
 * their plugin-channel specs (src/targets/emit-files.ts). Skills inline their rules: a plugin can't
 * ship loose rule files. `ctx` carries the pack name (paths under `plugins/<pack>/`) and the
 * pack's install set, which drives each file's conditional Boundary section.
 */
function writeMemberFiles(
  members: readonly ResolvedArtifact[],
  ctx: EmitContext,
  files: FileMap,
): void {
  for (const artifact of members) {
    const spec = specFor(CLAUDE_EMIT_SPECS, artifact.kind, 'plugin');
    if (spec) emitFile(spec, artifact, ctx, files);
  }
}

/** Parameters for {@link buildPlugin}. */
export interface BuildPluginOptions {
  /** The pack metadata. */
  pack: Pack;
  /** The artifacts that belong to this pack. */
  packArtifacts: ResolvedArtifact[];
  /** Full resolved catalog (for shared-agent lookup). */
  catalog: ResolvedCatalog;
  /** npm package version (written to plugin.json). */
  version: string;
  /** Optional URL override for author.url fields. */
  homepage?: string | undefined;
}

/**
 * Kinds this assembler has a writer for. This lists implementation coverage, not support — support
 * is CLAUDE_CAPABILITIES' plugin channel; test/targets/capabilities.test.ts asserts every native
 * plugin kind appears here, so a capability row flip fails `npm test`, not a release build.
 */
export const WRITABLE_PLUGIN_KINDS: ReadonlySet<ArtifactKind> = new Set([
  'skill',
  'agent',
  'workflow',
]);

/**
 * Returns a lookup of the pack's artifacts per kind, limited to the kinds `capabilities` marks
 * `native` on the plugin channel (`via`-kinds such as rules travel inside skills instead). Throws
 * when a kind is marked native but has no writer here, so flipping a capability row can never
 * silently drop artifacts from a plugin.
 */
export function pluginMembersByKind(
  packArtifacts: ResolvedArtifact[],
  capabilities: TargetCapabilities = CLAUDE_CAPABILITIES,
): (kind: ArtifactKind) => ResolvedArtifact[] {
  const native = nativeKinds({ capabilities }, 'plugin');
  const unwritable = native.filter(kind => !WRITABLE_PLUGIN_KINDS.has(kind));
  if (unwritable.length > 0) {
    throw new Error(
      `claude plugin channel marks [${unwritable.join(', ')}] native but plugin-assemble.ts has no ` +
        'writer for them — add one or change the row in claude-code/capabilities.ts',
    );
  }
  return kind => (native.includes(kind) ? packArtifacts.filter(a => a.kind === kind) : []);
}

/** Build all plugin files for a single pack. */
export function buildPlugin(options: BuildPluginOptions): FileMap {
  const { pack, packArtifacts, catalog, version, homepage } = options;
  const files: FileMap = {};
  const prefix = `plugins/${pack.name}`;

  files[`${prefix}/.claude-plugin/plugin.json`] = buildPluginJson(pack, version, homepage);

  const members = pluginMembersByKind(packArtifacts);
  const skills = members('skill');
  const agents = members('agent');
  const workflows = members('workflow');

  // Build the co-install set for the plugin: pack artifacts + shared agents.
  // Drives each file's conditional Boundary section.
  const packInstallSet = new Set<string>(packArtifacts.map(a => a.id));
  const sharedAgentIds = computeSharedAgentIds(skills, agents, packInstallSet);

  const sharedAgents = [...sharedAgentIds].flatMap(id => catalog.byId.get(id) ?? []);
  const ctx: EmitContext = { catalog, installSet: packInstallSet, packName: pack.name };
  writeMemberFiles([...workflows, ...skills, ...agents, ...sharedAgents], ctx, files);

  return files;
}
