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
import {
  COPILOT_MCP_SERVERS_KEY,
  COPILOT_CLI_MCP_FILE,
  COPILOT_CLI_MCP_SERVERS_KEY,
  VSCODE_MCP_ENV_SYNTAX,
} from './mcp-key';
import { expandEnvTokens, PORTABLE_MCP_ENV_SYNTAX } from '../env-reference';
import type { EnvSyntax } from '../env-reference';

/**
 * Copilot / VS Code config scopes, ordered by documented precedence (highest → lowest).
 * VS Code has NO distinct "local" MCP scope — project and local both resolve to the same
 * .vscode/mcp.json. So only two scopes are offered: Project (workspace) and User (profile).
 */
export const CONFIG_SCOPES = [
  {
    value: 'project' as ConfigScope,
    precedence: 1,
    shared: true,
    blastRadius: 'project' as const,
    description: 'workspace — .vscode/mcp.json + .mcp.json (Copilot CLI), git-committed',
  },
  {
    value: 'user' as ConfigScope,
    precedence: 2,
    shared: false,
    blastRadius: 'all-projects' as const,
    description: 'VS Code user-profile — all workspaces',
  },
];

/** The files one scope's mcp install writes: VS Code's, plus `.mcp.json` for Copilot CLI (project). */
function mcpDestinations(
  scope: ConfigScope,
): { file: string; root: ConfigRoot; section: string }[] {
  const vscode = {
    ...resolveCopilotConfigDestination('mcp', scope),
    section: COPILOT_MCP_SERVERS_KEY,
  };
  if (scope === 'user') return [vscode];
  return [
    vscode,
    { file: COPILOT_CLI_MCP_FILE, root: 'project', section: COPILOT_CLI_MCP_SERVERS_KEY },
  ];
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

/** The servers key and env-reference syntax of one MCP file. */
interface McpFileFormat {
  readonly key: string;
  readonly env: EnvSyntax;
}

/** VS Code's mcp.json files. */
const VSCODE_MCP_FORMAT: McpFileFormat = {
  key: COPILOT_MCP_SERVERS_KEY,
  env: VSCODE_MCP_ENV_SYNTAX,
};
/** The portable .mcp.json Copilot CLI reads (shared with Claude Code). */
const PORTABLE_MCP_FORMAT: McpFileFormat = {
  key: COPILOT_CLI_MCP_SERVERS_KEY,
  env: PORTABLE_MCP_ENV_SYNTAX,
};

/** Builds one mcp ConfigMergeOp: the server under `key` (VS Code `servers` unless told otherwise). */
export function buildMcpConfigOp(
  artifact: McpArtifact,
  dest: ReturnType<typeof resolveCopilotConfigDestination>,
  format: McpFileFormat = VSCODE_MCP_FORMAT,
): ConfigMergeOp {
  const fm = artifact.frontmatter;
  const server = fm.server as Record<string, unknown>;
  const serverName = (fm.name as string | undefined) ?? basenameOfId(artifact.id);
  const { description: _d, ...authored } = server as Record<string, unknown>;
  void _d;
  const serverConfig = expandEnvTokens(authored, format.env);
  const key = format.key;
  return {
    file: dest.file,
    root: dest.root,
    fragment: { [key]: { [serverName]: serverConfig } },
    strategy: { [key]: 'object-spread' },
    section: key,
  };
}

/**
 * Every op one mcp install needs: VS Code's file for the scope, plus — for the project scope — the
 * portable `.mcp.json` Copilot CLI reads (see COPILOT_CLI_MCP_FILE). The user scope stays VS
 * Code-only; Copilot CLI's user file (`~/.copilot/mcp-config.json`) is not a sigil root.
 */
export function buildMcpConfigOps(artifact: McpArtifact, scope: ConfigScope): ConfigMergeOp[] {
  const ops = [buildMcpConfigOp(artifact, resolveCopilotConfigDestination('mcp', scope))];
  if (scope !== 'user') {
    const cli = { file: COPILOT_CLI_MCP_FILE, root: 'project' as const };
    ops.push(buildMcpConfigOp(artifact, cli, PORTABLE_MCP_FORMAT));
  }
  return ops;
}
