/**
 * Free-standing helpers backing the `ClaudeCodeTarget` class methods — split out of
 * index.ts to keep that file under the repo's own module-size threshold.
 *
 * @module
 */
import type {
  ResolvedCatalog,
  FileMap,
  CompileOptions,
  ConfigMergeOp,
  ConfigScope,
  ConfigKind,
  ConfigScopeDestination,
} from '../../types';
import path from 'path';
import { resolveConfigRoot } from '../../config-utils';
import { resolveClaudeConfigDestination, CLAUDE_MCP_SERVERS_KEY } from './config';
import { JSON_INDENT } from '../../json-util';
import { getPackArtifacts } from './plugin-build';
import { buildPlugin } from './plugin-assemble';
import { buildHookConfigOps, buildSettingsConfigOps, buildMcpConfigOps } from './config-scaffold';

/** The 3 Claude Code config scopes, ordered by documented precedence (highest → lowest). */
export const CONFIG_SCOPES = [
  {
    value: 'local' as ConfigScope,
    precedence: 1,
    shared: false,
    blastRadius: 'project' as const,
    description: 'gitignored, personal — this repo only',
  },
  {
    value: 'project' as ConfigScope,
    precedence: 2,
    shared: true,
    blastRadius: 'project' as const,
    description: 'git-committed, shared with your team',
  },
  {
    value: 'user' as ConfigScope,
    precedence: 3,
    shared: false,
    blastRadius: 'all-projects' as const,
    description: 'global — affects ALL your projects',
  },
];

/**
 * Derives the in-file JSON key-path for one scope's destination so same-file scopes
 * (local vs user both write ~/.claude.json) are displayed as visibly distinct in the
 * scope menu.
 *   local → 'projects › <abs-project-path> › mcpServers'  (wrapPath nests it)
 *   user  → 'mcpServers'                                    (top-level key)
 */
export function buildScopeDestination(
  kind: ConfigKind,
  scopeValue: ConfigScope,
  projectDir: string,
): ConfigScopeDestination {
  const d = resolveClaudeConfigDestination(kind, scopeValue, projectDir);
  const section =
    kind === 'mcp' ? [...(d.wrapPath ?? []), CLAUDE_MCP_SERVERS_KEY].join(' › ') : undefined;
  return {
    kind,
    file: d.file,
    root: d.root,
    fullPath: path.join(resolveConfigRoot(d.root, projectDir), d.file),
    section,
  };
}

/** Builds the marketplace.json content (flat top-level schema: name/owner/plugins[]). */
export function buildMarketplaceJson(
  pluginEntries: Array<{ name: string; displayName: string; description: string; source: string }>,
  homepage: string | undefined,
): string {
  // See: code.claude.com/docs/en/plugin-marketplaces
  const marketplaceUrl = homepage ?? 'https://github.com/makubexD/sigil#readme';
  return (
    JSON.stringify(
      {
        name: 'sigil',
        owner: { name: 'Sigil', url: marketplaceUrl },
        description: 'Vendor-neutral AI skills, agents, and rules for multiple languages.',
        plugins: pluginEntries,
      },
      null,
      JSON_INDENT,
    ) + '\n'
  );
}

/** One pack's marketplace.json entry. */
export interface PluginEntry {
  name: string;
  displayName: string;
  description: string;
  source: string;
}

/** Builds one pack's marketplace.json entry. */
function buildPluginEntry(pack: CompileOptions['packs'][number]): PluginEntry {
  return {
    name: pack.name,
    displayName: pack.displayName,
    description: pack.description,
    source: `./plugins/${pack.name}`,
  };
}

/** Builds one pack's plugin files + its marketplace.json entry. */
export function buildOnePackPlugin(
  pack: CompileOptions['packs'][number],
  catalog: ResolvedCatalog,
  options: CompileOptions,
): { files: FileMap; entry: PluginEntry } {
  const packArtifacts = getPackArtifacts(pack, catalog);
  const files = buildPlugin({
    pack,
    packArtifacts,
    catalog,
    version: options.version,
    homepage: options.homepage,
  });
  return { files, entry: buildPluginEntry(pack) };
}

/** Builds config merge ops for one config-kind artifact, dispatching by kind. */
export function scaffoldConfigByKind(
  artifact: NonNullable<ReturnType<ResolvedCatalog['byId']['get']>>,
  dest: ReturnType<typeof resolveClaudeConfigDestination>,
): ConfigMergeOp[] {
  switch (artifact.kind) {
    case 'hook':
      return buildHookConfigOps(artifact, dest);
    case 'settings':
      return buildSettingsConfigOps(artifact, dest);
    case 'mcp':
      return buildMcpConfigOps(artifact, dest);
    default:
      throw new Error(`scaffoldConfig not supported for kind '${artifact.kind}'`);
  }
}
