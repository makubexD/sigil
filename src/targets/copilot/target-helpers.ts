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
import { COPILOT_MCP_SERVERS_KEY } from './mcp-key';

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
    description: 'workspace — .vscode/mcp.json, git-committed',
  },
  {
    value: 'user' as ConfigScope,
    precedence: 2,
    shared: false,
    blastRadius: 'all-projects' as const,
    description: 'VS Code user-profile — all workspaces',
  },
];

/** Builds one scope's mcp destination info, or [] when the kind isn't 'mcp' (Copilot-only). */
export function buildScopeDestinations(
  kinds: ConfigKind[],
  scopeValue: ConfigScope,
  projectDir: string,
): ConfigScopeDestination[] {
  return kinds
    .filter(k => k === 'mcp')
    .map(kind => {
      const d = resolveCopilotConfigDestination('mcp', scopeValue);
      return {
        kind: kind as ConfigKind,
        file: d.file,
        root: d.root,
        fullPath: path.join(resolveConfigRoot(d.root, projectDir), d.file),
        // Copilot uses COPILOT_MCP_SERVERS_KEY (not 'mcpServers') — surface for display consistency.
        section: COPILOT_MCP_SERVERS_KEY,
      };
    });
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

/** Builds the single mcp ConfigMergeOp for Copilot/VS Code (uses COPILOT_MCP_SERVERS_KEY). */
export function buildMcpConfigOp(
  artifact: NonNullable<ReturnType<ResolvedCatalog['byId']['get']>>,
  dest: ReturnType<typeof resolveCopilotConfigDestination>,
): ConfigMergeOp {
  const fm = artifact.frontmatter;
  const server = fm.server as Record<string, unknown>;
  const serverName = (fm.name as string | undefined) ?? basenameOfId(artifact.id);
  const { description: _d, ...serverConfig } = server as Record<string, unknown>;
  void _d;

  // VS Code / Copilot uses COPILOT_MCP_SERVERS_KEY (not 'mcpServers' which is the Claude Code key)
  return {
    file: dest.file,
    root: dest.root,
    fragment: { [COPILOT_MCP_SERVERS_KEY]: { [serverName]: serverConfig } },
    strategy: { [COPILOT_MCP_SERVERS_KEY]: 'object-spread' },
    section: COPILOT_MCP_SERVERS_KEY,
  };
}
