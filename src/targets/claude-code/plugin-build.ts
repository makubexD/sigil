/**
 * Pack membership for the Claude Code plugin build: which catalog artifacts a pack's plugin
 * holds. The files themselves are written by plugin-assemble.ts through the plugin-channel
 * specs (src/targets/emit-files.ts); skills there inline their rules, because a plugin can't ship
 * loose rule files.
 */
import type { ResolvedCatalog, ResolvedArtifact, Pack } from '../../types';
import { basenameOfId } from '../../paths';

/**
 * The generated plugin name for a config-kind artifact: `hook-<basename>` or `mcp-<basename>`
 * (`shared/protect-config` → `hook-protect-config`). Lives here, not in plugin-config.ts, because
 * plugin-assemble.ts needs the same name and plugin-config.ts already imports that module.
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
