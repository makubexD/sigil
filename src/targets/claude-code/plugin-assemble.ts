/**
 * Assembles a pack's full plugin FileMap: plugin.json, plus its skills, agents, workflows and
 * prompts written through their plugin-channel specs (../emit-files.ts).
 *
 * @module
 */
import type {
  ResolvedCatalog,
  ResolvedArtifact,
  FileMap,
  Pack,
  MarketplaceIdentity,
} from '../../types';
import { JSON_INDENT } from '../../json-util';
import { SigilError } from '../../errors';
import { CLAUDE_EMIT_SPECS } from './spec';
import { emitFile, specFor } from '../emit-files';
import type { EmitContext } from '../spec-types';
import type { ArtifactKind } from '../../types';
import { nativeKinds } from '../capabilities';
import { CLAUDE_CAPABILITIES } from './capabilities';
import type { TargetCapabilities } from '../capability-types';

const PLUGIN_MANIFEST_SCHEMA = 'https://json.schemastore.org/claude-code-plugin-manifest.json';

/** A person/org entry in a configured marketplace identity. */
export type IdentityContact = MarketplaceIdentity['owner'];

/**
 * A configured owner/author entry, with `url` defaulting to the identity's `homepage` when the
 * contact sets none. Keys that would hold `undefined` are omitted rather than written.
 */
export function resolveIdentityContact(
  contact: IdentityContact,
  homepage: string | undefined,
): IdentityContact {
  const url = contact.url ?? homepage;
  return {
    name: contact.name,
    ...(url !== undefined ? { url } : {}),
    ...(contact.email !== undefined ? { email: contact.email } : {}),
  };
}

/** Build the `plugin.json` manifest content for a pack. */
export function buildPluginJson(pack: Pack, options: BuildPluginOptions): string {
  const manifest = options.marketplace
    ? configuredPluginManifest(pack, options.version, options.marketplace)
    : sigilPluginManifest(pack, options.version, options.homepage);
  return JSON.stringify(manifest, null, JSON_INDENT) + '\n';
}

/** Today's sigil-literal manifest, emitted when no marketplace identity is configured. */
function sigilPluginManifest(pack: Pack, version: string, homepage: string | undefined) {
  const pluginUrl = homepage ?? 'https://github.com/makubexD/sigil#readme';
  return {
    $schema: PLUGIN_MANIFEST_SCHEMA,
    name: pack.name,
    displayName: pack.displayName,
    version,
    description: pack.description,
    author: { name: 'Sigil', url: pluginUrl },
    license: 'MIT',
    keywords: pack.languages ?? [],
  };
}

/** Manifest built from a configured identity: absent fields are omitted, never sigil's values. */
function configuredPluginManifest(pack: Pack, version: string, marketplace: MarketplaceIdentity) {
  const author = resolveIdentityContact(
    marketplace.author ?? marketplace.owner,
    marketplace.homepage,
  );
  return {
    $schema: PLUGIN_MANIFEST_SCHEMA,
    name: pack.name,
    displayName: pack.displayName,
    version,
    description: pack.description,
    author,
    ...(marketplace.license !== undefined ? { license: marketplace.license } : {}),
    keywords: pack.languages ?? [],
  };
}

/**
 * Compute the shared-agent ids referenced by `skills` that aren't already part of `agents`,
 * and add them to `packInstallSet` (mutated in place) so each file's conditional Boundary
 * section sees them as co-present. An id in `excluded` stays out even when a skill uses it.
 */
function computeSharedAgentIds(
  skills: ResolvedArtifact[],
  agents: ResolvedArtifact[],
  excluded: ReadonlySet<string>,
  packInstallSet: Set<string>,
): Set<string> {
  // Set lookup instead of agents.some() per (skill, resolvedAgentId) pair below — was
  // O(skills * resolvedAgentIds * agents); fixed in the 2026-08-26 round after a dogfooded
  // ts-performance-profiler run flagged it (see docs/audits/2026-08-25/register.md's backlog).
  const agentIds = new Set(agents.map(a => a.id));
  const sharedAgentIds = new Set<string>();
  for (const skill of skills) {
    for (const agentId of skill.resolvedAgentIds ?? []) {
      if (!agentIds.has(agentId) && !excluded.has(agentId)) {
        sharedAgentIds.add(agentId);
        packInstallSet.add(agentId);
      }
    }
  }
  return sharedAgentIds;
}

/**
 * Writes the pack's workflows, prompts, skills and agents (plus the shared agents its skills use)
 * through their plugin-channel specs (src/targets/emit-files.ts). Skills inline their rules: a
 * plugin can't ship loose rule files. `ctx` carries the pack name (paths under `plugins/<pack>/`)
 * and the pack's install set, which drives each file's conditional Boundary section.
 *
 * Two different members whose spec resolves to the same output path fail the build: a plugin
 * skill folder has no per-kind namespace, so a skill and a prompt named alike would silently
 * overwrite each other. The same artifact id written twice stays legal: a pack may list one twice.
 */
function writeMemberFiles(
  members: readonly ResolvedArtifact[],
  ctx: EmitContext,
  files: FileMap,
): void {
  const writtenBy = new Map<string, string>();
  for (const artifact of members) {
    const spec = specFor(CLAUDE_EMIT_SPECS, artifact.kind, 'plugin');
    if (!spec) continue;
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
  /** Configured marketplace/plugin identity; absent keeps sigil's own values. */
  marketplace?: MarketplaceIdentity | undefined;
}

/**
 * Kinds the plugin channel has a writer for — these four here, `hook` and `mcp` in plugin-config.ts
 * (one generated plugin per artifact). This lists implementation coverage, not support — support is
 * CLAUDE_CAPABILITIES' plugin channel; test/targets/capabilities.test.ts asserts every native plugin
 * kind appears here, so a capability row flip fails `npm test`, not a release build.
 */
export const WRITABLE_PLUGIN_KINDS: ReadonlySet<ArtifactKind> = new Set([
  'skill',
  'agent',
  'workflow',
  'prompt',
  'hook',
  'mcp',
]);

/**
 * Kinds a pack plugin carries. Config kinds (`hook`, `mcp`) get their own generated plugins
 * instead, one per artifact, so a pack's plugin never writes `hooks/hooks.json` or `.mcp.json`.
 */
export const PACK_PLUGIN_KINDS: ReadonlySet<ArtifactKind> = new Set([
  'skill',
  'agent',
  'workflow',
  'prompt',
]);

/**
 * Returns a lookup of the pack's artifacts per kind, limited to the kinds `capabilities` marks
 * `native` on the plugin channel (`via`-kinds such as rules travel inside skills instead) and
 * `PACK_PLUGIN_KINDS` (config kinds get their own plugins). Throws
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
  return kind =>
    native.includes(kind) && PACK_PLUGIN_KINDS.has(kind)
      ? packArtifacts.filter(a => a.kind === kind)
      : [];
}

/**
 * Whether a pack has at least one artifact the plugin channel delivers. A pack whose artifacts
 * the plugin channel can't carry (only `mcp` / `hook` / `settings`, or rules with no skill) gets
 * no plugin, so the marketplace never lists an empty one.
 */
export function hasPluginMembers(packArtifacts: ResolvedArtifact[]): boolean {
  const members = pluginMembersByKind(packArtifacts);
  for (const kind of PACK_PLUGIN_KINDS) {
    if (members(kind).length > 0) return true;
  }
  return false;
}

/** Build all plugin files for a single pack. */
export function buildPlugin(options: BuildPluginOptions): FileMap {
  const { pack, packArtifacts, catalog } = options;
  const files: FileMap = {};
  const prefix = `plugins/${pack.name}`;

  files[`${prefix}/.claude-plugin/plugin.json`] = buildPluginJson(pack, options);

  const members = pluginMembersByKind(packArtifacts);
  const skills = members('skill');
  const agents = members('agent');
  const workflows = members('workflow');
  const prompts = members('prompt');

  // Build the co-install set for the plugin: pack artifacts + shared agents.
  // Drives each file's conditional Boundary section.
  const packInstallSet = new Set<string>(packArtifacts.map(a => a.id));
  const excluded = new Set(pack.pluginExclude ?? []);
  const sharedAgentIds = computeSharedAgentIds(skills, agents, excluded, packInstallSet);

  const sharedAgents = [...sharedAgentIds].flatMap(id => catalog.byId.get(id) ?? []);
  const ctx: EmitContext = { catalog, installSet: packInstallSet, packName: pack.name };
  writeMemberFiles([...workflows, ...prompts, ...skills, ...agents, ...sharedAgents], ctx, files);

  return files;
}
