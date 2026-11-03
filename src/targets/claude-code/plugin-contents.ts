/**
 * What each Claude Code marketplace plugin holds, computed from the same pack membership and
 * config-plugin selection the build writes (plugin-assemble.ts, plugin-config.ts). The duplicate
 * guard reads this, so it can never disagree with `.claude-plugin/marketplace.json`.
 *
 * @module
 */
import type { Pack, ResolvedArtifact, ResolvedCatalog } from '../../types';
import { configPluginName, getPackArtifacts } from './plugin-build';
import { hasPluginMembers, packPluginMembers } from './plugin-assemble';
import { configPluginArtifacts } from './plugin-config';

/** Every id a pack plugin carries, deduplicated and sorted. */
function packMemberIds(members: ResolvedArtifact[]): string[] {
  return [...new Set(members.map(artifact => artifact.id))].sort();
}

/**
 * Plugin name → the catalog ids it delivers, in marketplace order: the pack plugins in `packs`
 * order (a pack the plugin channel can't carry is left out), then one generated plugin per config
 * artifact (`hook-<basename>`, `mcp-<basename>`). Each id list is sorted.
 */
export function marketplacePluginContents(
  catalog: ResolvedCatalog,
  packs: Pack[],
): ReadonlyMap<string, readonly string[]> {
  const contents = new Map<string, readonly string[]>();
  for (const pack of packs) {
    const packArtifacts = getPackArtifacts(pack, catalog);
    if (!hasPluginMembers(packArtifacts)) continue;
    const members = packPluginMembers(pack, packArtifacts, catalog);
    contents.set(pack.name, packMemberIds(members.artifacts));
  }
  for (const artifact of configPluginArtifacts(catalog)) {
    contents.set(configPluginName(artifact), [artifact.id]);
  }
  return contents;
}
