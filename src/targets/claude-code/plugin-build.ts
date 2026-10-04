/**
 * Pack membership for the Claude Code plugin build: which catalog artifacts a pack's plugin
 * holds. The files themselves are written by plugin-assemble.ts through the plugin-channel
 * specs (src/targets/emit-files.ts); skills there inline their rules, because a plugin can't ship
 * loose rule files.
 */
import type { ResolvedCatalog, ResolvedArtifact, Pack } from '../../types';

/**
 * Select the artifacts that belong to a pack.
 *
 * When the pack declares an explicit `artifacts:` list, use that.
 * Otherwise fall back to all catalog artifacts whose language matches
 * one of the pack's declared languages.
 */
export function getPackArtifacts(pack: Pack, catalog: ResolvedCatalog): ResolvedArtifact[] {
  if (pack.artifacts && pack.artifacts.length > 0) {
    return pack.artifacts
      .map(id => catalog.byId.get(id))
      .filter((a): a is ResolvedArtifact => a !== undefined);
  }
  const langs = new Set(pack.languages ?? []);
  return catalog.artifacts.filter(a => {
    const lang = a.frontmatter.language as string | undefined;
    return lang !== undefined && langs.has(lang);
  });
}
