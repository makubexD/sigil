/**
 * Free-standing helpers backing the `CopilotTarget` class methods — split out of
 * index.ts to keep that file under the repo's own module-size threshold.
 *
 * @module
 */
import type {
  ResolvedCatalog,
  FileMap,
  ConfigMergeOp,
  ConfigScope,
  ConfigKind,
  ConfigScopeDestination,
  ConfigRoot,
  ArtifactKind,
} from '../../types';
import path from 'path';
import { resolveConfigRoot } from '../../config-utils';
import { resolveCopilotConfigDestination } from './config';
import { basenameOfId } from '../../paths';
import { buildCopilotInstructions } from './build-helpers';
import { emitFile, specFor } from '../emit-files';
import type { KindEmitSpec } from '../spec-types';
import { COPILOT_MCP_SERVERS_KEY } from './mcp-key';
import { expandEnvTokens, PORTABLE_MCP_ENV_SYNTAX } from '../env-reference';

/**
 * Copilot / VS Code config scopes, ordered by documented precedence (highest → lowest).
 * Copilot has no distinct "local" MCP scope — project and local both resolve to the project's
 * .mcp.json. So only two scopes are offered: Project (.mcp.json) and User (mcp-config.json).
 */
export const CONFIG_SCOPES = [
  {
    value: 'project' as ConfigScope,
    precedence: 1,
    shared: true,
    blastRadius: 'project' as const,
    description: 'workspace — .mcp.json, git-committed',
  },
  {
    value: 'user' as ConfigScope,
    precedence: 2,
    shared: false,
    blastRadius: 'all-projects' as const,
    description: 'user — ~/.copilot/mcp-config.json, all workspaces',
  },
];

/** The file one scope's mcp install writes, with the JSON key its servers sit under. */
function mcpDestinations(
  scope: ConfigScope,
): { file: string; root: ConfigRoot; section: string }[] {
  return [{ ...resolveCopilotConfigDestination('mcp', scope), section: COPILOT_MCP_SERVERS_KEY }];
}

/** Builds one scope's mcp destinations (the same files buildMcpConfigOps writes), or []. */
export function buildScopeDestinations(
  kinds: ConfigKind[],
  scopeValue: ConfigScope,
  projectDir: string,
): ConfigScopeDestination[] {
  if (!kinds.includes('mcp')) return [];
  return mcpDestinations(scopeValue).map(d => ({
    kind: 'mcp' as ConfigKind,
    file: d.file,
    root: d.root,
    fullPath: path.join(resolveConfigRoot(d.root, projectDir), d.file),
    section: d.section,
  }));
}

/** Globs that mean "every file" — a rule scoped only to these belongs in the repo-wide aggregate. */
const REPO_WIDE_GLOBS: ReadonlySet<string> = new Set(['**', '**/*']);

/**
 * True for a language-less rule with no `appliesTo`, or one scoped only to every file. Any other
 * rule — including a language-less one with narrowed globs — needs its own `applyTo` file: folding
 * it into copilot-instructions.md would silently widen it to the whole repository (CLAUDE.md's
 * `appliesTo` invariant).
 */
function isRepoWideRule(rule: ResolvedCatalog['artifacts'][number]): boolean {
  if (rule.frontmatter.language) return false;
  const globs = rule.frontmatter.appliesTo as string[] | undefined;
  return !globs || globs.every(glob => REPO_WIDE_GLOBS.has(glob));
}

/** The per-file kinds `compile` writes; agents go only into the AGENTS.md aggregate. */
const COMPILED_FILE_KINDS: ReadonlySet<ArtifactKind> = new Set([
  'rule',
  'skill',
  'prompt',
  'workflow',
]);

/**
 * Writes every per-file artifact of a full build through its spec (src/targets/emit-files.ts):
 * scoped rules, skills with their references, prompts and workflows. Repo-wide rules go into
 * `.github/copilot-instructions.md` instead. `ctx` co-installs the whole catalog, so a skill's
 * Boundary section resolves the way an agent's does in AGENTS.md.
 */
export function buildArtifactFiles(
  catalog: ResolvedCatalog,
  specs: readonly KindEmitSpec[],
  files: FileMap,
): void {
  const ctx = { catalog, installSet: new Set(catalog.artifacts.map(a => a.id)) };
  const repoWideRules = catalog.artifacts.filter(a => a.kind === 'rule' && isRepoWideRule(a));
  if (repoWideRules.length > 0) {
    files['.github/copilot-instructions.md'] = buildCopilotInstructions(repoWideRules);
  }
  for (const artifact of catalog.artifacts) {
    if (!COMPILED_FILE_KINDS.has(artifact.kind) || repoWideRules.includes(artifact)) continue;
    const spec = specFor(specs, artifact.kind, 'scaffold');
    if (spec) emitFile(spec, artifact, ctx, files);
  }
}

type McpArtifact = NonNullable<ReturnType<ResolvedCatalog['byId']['get']>>;

/**
 * The op one mcp install needs for `scope`: the server, its `{sigil:env:NAME}` tokens written as
 * `${NAME}` (the syntax GitHub documents for Copilot's MCP files), under `mcpServers` in the
 * scope's portable file (./config.ts).
 */
export function buildMcpConfigOps(artifact: McpArtifact, scope: ConfigScope): ConfigMergeOp[] {
  const dest = resolveCopilotConfigDestination('mcp', scope);
  const fm = artifact.frontmatter;
  const serverName = (fm.name as string | undefined) ?? basenameOfId(artifact.id);
  const { description: _d, ...authored } = fm.server as Record<string, unknown>;
  void _d;
  const serverConfig = expandEnvTokens(authored, PORTABLE_MCP_ENV_SYNTAX);
  const key = COPILOT_MCP_SERVERS_KEY;
  return [
    {
      file: dest.file,
      root: dest.root,
      fragment: { [key]: { [serverName]: serverConfig } },
      strategy: { [key]: 'object-spread' },
      section: key,
    },
  ];
}
