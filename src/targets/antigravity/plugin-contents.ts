/**
 * What each Antigravity plugin holds, computed from the same pack membership and config-plugin
 * selection the build writes (plugin-assemble.ts, plugin-config.ts). The duplicate guard reads
 * this, so it can never disagree with `dist/antigravity/plugins/`.
 *
 * A pack plugin holds only the members its plugin-channel spec writes: a scoped rule is skipped
 * by the build (ADR probe B1), so it is not an id the plugin delivers.
 *
 * @module
 */
import type { Pack, ResolvedArtifact, ResolvedCatalog } from '../../types';
import { configPluginName } from '../shared/plugin-packs';
import { isWritable, packMembers } from './plugin-assemble';
import { antigravityConfigPluginArtifacts } from './plugin-config';

/** Every id a pack plugin carries, deduplicated and sorted. */
function memberIds(members: readonly ResolvedArtifact[]): string[] {
  return [...new Set(members.filter(isWritable).map(artifact => artifact.id))].sort();
}

/**
 * Plugin name → the catalog ids it delivers, in build order: the pack plugins in `packs` order
 * (a pack holding nothing the plugin channel can write is left out), then one generated plugin
 * per config artifact (`hook-<basename>`, `mcp-<basename>`). Each id list is sorted.
 */
export function antigravityPluginContents(
  catalog: ResolvedCatalog,
  packs: Pack[],
): ReadonlyMap<string, readonly string[]> {
  const contents = new Map<string, readonly string[]>();
  for (const pack of packs) {
    const { members } = packMembers(pack, catalog);
    if (!members.some(isWritable)) continue;
    contents.set(pack.name, memberIds(members));
  }
  for (const artifact of antigravityConfigPluginArtifacts(catalog)) {
    contents.set(configPluginName(artifact), [artifact.id]);
  }
  return contents;
}
