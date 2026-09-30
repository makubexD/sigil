/**
 * Assembles a pack's full plugin FileMap (plugin.json + skills/agents/workflows) from
 * the per-artifact renderers in plugin-build.ts. Split out to keep that file under the
 * repo's own module-size threshold.
 *
 * @module
 */
import type { ResolvedCatalog, ResolvedArtifact, FileMap, Pack } from '../../types';
import { SKILL_FILENAME } from '../../paths';
import { JSON_INDENT } from '../../json-util';
import { buildPluginSkillMd, buildAgentMd, buildWorkflowMd } from './plugin-build';
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
 * and add them to `packInstallSet` (mutated in place) so `buildAgentMd`'s conditional Boundary
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

/** Write workflow → user-invoked-skill files into `files`. Formerly `${prefix}/commands/*.md` —
 * see spec/workflow.ts's header for the commands-merged-into-skills migration. */
function writeWorkflowFiles(workflows: ResolvedArtifact[], prefix: string, files: FileMap): void {
  for (const workflow of workflows) {
    const slug = workflow.id.replace(/\//g, '-');
    files[`${prefix}/skills/${slug}/${SKILL_FILENAME}`] = buildWorkflowMd(workflow);
  }
}

/** Shared build context for {@link writeSkillFiles} — same shape as {@link AgentFilesCtx}. */
interface SkillFilesCtx {
  catalog: ResolvedCatalog;
  packInstallSet: Set<string>;
  prefix: string;
}

/** Write skill SKILL.md + reference files into `files`. */
function writeSkillFiles(skills: ResolvedArtifact[], ctx: SkillFilesCtx, files: FileMap): void {
  const { catalog, packInstallSet, prefix } = ctx;
  for (const skill of skills) {
    const skillName = skill.frontmatter.name as string;
    // Plugin build (dist/claude/) — rules are inlined (inlineRules: true) because plugins
    // cannot ship loose rule files; see buildPluginSkillMd's doc comment. catalog/packInstallSet
    // drive the skill's own conditional Boundary section, same as writeAgentFiles below.
    files[`${prefix}/skills/${skillName}/${SKILL_FILENAME}`] = buildPluginSkillMd(
      skill,
      true,
      catalog,
      packInstallSet,
    );

    for (const ref of skill.references ?? []) {
      files[`${prefix}/skills/${skillName}/references/${ref.name}`] = ref.content;
    }
  }
}

/** Shared build context for {@link writeAgentFiles}. */
interface AgentFilesCtx {
  catalog: ResolvedCatalog;
  packInstallSet: Set<string>;
  prefix: string;
}

/** Write agent .md files (pack agents + shared agents) into `files`. */
function writeAgentFiles(
  agents: ResolvedArtifact[],
  sharedAgentIds: Set<string>,
  ctx: AgentFilesCtx,
  files: FileMap,
): void {
  const { catalog, packInstallSet, prefix } = ctx;
  for (const agent of agents) {
    const agentName = agent.frontmatter.name as string;
    files[`${prefix}/agents/${agentName}.md`] = buildAgentMd(agent, catalog, packInstallSet);
  }

  for (const agentId of sharedAgentIds) {
    const agent = catalog.byId.get(agentId);
    if (agent) {
      const agentName = agent.frontmatter.name as string;
      files[`${prefix}/agents/${agentName}.md`] = buildAgentMd(agent, catalog, packInstallSet);
    }
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
  // Used by buildAgentMd for conditional Boundary section rendering.
  const packInstallSet = new Set<string>(packArtifacts.map(a => a.id));
  const sharedAgentIds = computeSharedAgentIds(skills, agents, packInstallSet);

  writeWorkflowFiles(workflows, prefix, files);
  writeSkillFiles(skills, { catalog, packInstallSet, prefix }, files);
  writeAgentFiles(agents, sharedAgentIds, { catalog, packInstallSet, prefix }, files);

  return files;
}
