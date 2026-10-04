/**
 * Free-standing helpers backing the `CopilotTarget` class methods — split out of
 * index.ts to keep that file under the repo's own module-size threshold.
 *
 * @module
 */
import type {
  ResolvedCatalog,
  FileMap,
  ScaffoldOptions,
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
import { basenameOfId, SKILL_FILENAME } from '../../paths';
import {
  buildCopilotInstructions,
  buildInstructionsFile,
  buildSkillMd,
  buildPromptFile,
} from './build-helpers';
import {
  scaffoldSkill,
  scaffoldRule,
  scaffoldAgent,
  scaffoldPrompt,
  scaffoldWorkflow,
} from './scaffold';
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

/** Builds copilot-instructions.md (repo-wide rules) + one instructions file per scoped rule. */
export function buildRuleFiles(rules: ResolvedCatalog['artifacts'], files: FileMap): void {
  const repoWideRules = rules.filter(isRepoWideRule);
  if (repoWideRules.length > 0) {
    files['.github/copilot-instructions.md'] = buildCopilotInstructions(repoWideRules);
  }

  const scopedRules = rules.filter(r => !isRepoWideRule(r));
  for (const rule of scopedRules) {
    const slug = rule.id.replace(/\//g, '-');
    files[`.github/instructions/${slug}.instructions.md`] = buildInstructionsFile(rule);
  }
}

/**
 * Builds each skill's SKILL.md + reference files from catalog skills. `catalog`/`installSet`,
 * when provided, drive each skill's own conditional `## Boundary` section (its `relatedArtifacts`)
 * — same mechanism `buildAgentsMd` already uses for agents in the same full build.
 */
export function buildSkillFiles(
  skills: ResolvedCatalog['artifacts'],
  files: FileMap,
  catalog?: ResolvedCatalog,
  installSet?: Set<string>,
): void {
  for (const skill of skills) {
    const name = skill.frontmatter.name as string;
    files[`.github/skills/${name}/${SKILL_FILENAME}`] = buildSkillMd(skill, catalog, installSet);
    for (const ref of skill.references ?? []) {
      files[`.github/skills/${name}/references/${ref.name}`] = ref.content;
    }
  }
}

/** Builds prompts/*.prompt.md from catalog prompts and workflows (both render as prompt files). */
export function buildPromptFiles(
  prompts: ResolvedCatalog['artifacts'],
  workflows: ResolvedCatalog['artifacts'],
  files: FileMap,
): void {
  for (const prompt of prompts) {
    const slug = prompt.id.replace(/\//g, '-');
    files[`.github/prompts/${slug}.prompt.md`] = buildPromptFile(prompt);
  }
  for (const workflow of workflows) {
    const slug = workflow.id.replace(/\//g, '-');
    files[`.github/prompts/${slug}.prompt.md`] = buildPromptFile(workflow);
  }
}

/** Maps an artifact kind to its scaffold* function; throws for unsupported kinds. */
const SCAFFOLD_BY_KIND: Partial<
  Record<
    ArtifactKind,
    (
      artifact: NonNullable<ReturnType<ResolvedCatalog['byId']['get']>>,
      catalog: ResolvedCatalog,
      files: FileMap,
      options: ScaffoldOptions,
    ) => void
  >
> = {
  skill: (a, catalog, files, options) => scaffoldSkill(a, catalog, files, options),
  agent: (a, catalog, files, options) => scaffoldAgent(a, files, catalog, options.coInstallSet),
  rule: (a, _catalog, files) => scaffoldRule(a, files),
  prompt: (a, _catalog, files) => scaffoldPrompt(a, files),
  workflow: (a, _catalog, files) => scaffoldWorkflow(a, files),
};

/** Scaffolds one artifact by kind, dispatching to the matching scaffold* function. */
export function scaffoldByKind(
  artifact: NonNullable<ReturnType<ResolvedCatalog['byId']['get']>>,
  catalog: ResolvedCatalog,
  files: FileMap,
  options: ScaffoldOptions,
): void {
  const fn = SCAFFOLD_BY_KIND[artifact.kind];
  if (!fn) throw new Error(`Scaffolding not supported for kind '${artifact.kind}'`);
  fn(artifact, catalog, files, options);
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
