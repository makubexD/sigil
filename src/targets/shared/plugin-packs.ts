/**
 * Pack membership helpers shared by every plugin-building target, so no target imports another:
 * which catalog artifacts a pack's plugin holds, and the generated plugin name for a config-kind
 * artifact. The files themselves are written by each target's own assembler through its
 * plugin-channel specs (src/targets/emit-files.ts).
 */
import type { ResolvedCatalog, ResolvedArtifact, Pack } from '../../types';
import { basenameOfId } from '../../paths';

/**
 * The generated plugin name for a config-kind artifact: `hook-<basename>` or `mcp-<basename>`
 * (`shared/protect-config` → `hook-protect-config`). Each target's config-plugin builder and its
 * pack assembler need the same name, so it is defined once here.
 */
export function configPluginName(artifact: Pick<ResolvedArtifact, 'id' | 'kind'>): string {
  return `${artifact.kind}-${basenameOfId(artifact.id)}`;
}

/**
 * Select the artifacts that belong to a pack.
 *
 * When the pack declares an explicit `artifacts:` list, use that, minus its `pluginExclude`.
 * Otherwise fall back to all catalog artifacts whose language matches
 * one of the pack's declared languages.
 */
export function getPackArtifacts(pack: Pack, catalog: ResolvedCatalog): ResolvedArtifact[] {
  if (pack.artifacts && pack.artifacts.length > 0) {
    const excluded = new Set(pack.pluginExclude ?? []);
    return pack.artifacts
      .filter(id => !excluded.has(id))
      .map(id => catalog.byId.get(id))
      .filter((a): a is ResolvedArtifact => a !== undefined);
  }
  const langs = new Set(pack.languages ?? []);
  return catalog.artifacts.filter(a => {
    const lang = a.frontmatter.language as string | undefined;
    return lang !== undefined && langs.has(lang);
  });
}

/**
 * Compute the shared-agent ids referenced by `skills` that aren't already part of `agents`,
 * and add them to `packInstallSet` (mutated in place) so each file's conditional Boundary
 * section sees them as co-present. An id in `excluded` stays out even when a skill uses it.
 */
export function computeSharedAgentIds(
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
