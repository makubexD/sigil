/**
 * GitHub Copilot target adapter.
 *
 * Full build (compile): emits the .github/ directory layout that Copilot reads natively.
 *   dist/copilot/
 *     .github/
 *       copilot-instructions.md           ← shared baseline rules (apply to all files)
 *       instructions/<lang>-style.instructions.md
 *       skills/<skill-name>/SKILL.md
 *       prompts/<slug>.prompt.md
 *       AGENTS.md
 *
 * Scaffold (add): emits per-artifact files — never clobbers an aggregate file.
 *   .github/
 *     skills/<name>/SKILL.md
 *     instructions/<slug>.instructions.md
 *     prompts/<slug>.prompt.md
 *     agents/<name>.agent.md
 *
 * Sub-modules:
 *   config        — CopilotConfigDestination, resolveCopilotConfigDestination
 *   build-helpers — buildCopilotInstructions, buildInstructionsFile, buildSkillMd,
 *                   buildPromptFile, buildAgentsMd
 *   scaffold      — scaffoldSkill, scaffoldRule, scaffoldAgent, scaffoldPrompt, scaffoldWorkflow
 */
/**
 * JSON section key where GitHub Copilot stores MCP server configs.
 * Copilot uses `servers` (not `mcpServers` which is the Claude Code convention).
 */
export const COPILOT_MCP_SERVERS_KEY = 'servers';

import type {
  Target,
  ResolvedCatalog,
  FileMap,
  CompileOptions,
  ScaffoldOptions,
  ConfigMergeOp,
  ConfigScope,
  ConfigKind,
  ConfigScopeInfo,
  ArtifactKind,
  KindVocabulary,
  ContractEntry,
} from '../../types';
import path from 'path';
import { resolveConfigRoot } from '../../config-utils';
import { resolveCopilotConfigDestination } from './config';
import { basenameOfId } from '../../paths';
import {
  buildCopilotInstructions,
  buildInstructionsFile,
  buildSkillMd,
  buildPromptFile,
  buildAgentsMd,
} from './build-helpers';
import {
  scaffoldSkill,
  scaffoldRule,
  scaffoldAgent,
  scaffoldPrompt,
  scaffoldWorkflow,
} from './scaffold';

export { CopilotConfigDestination, resolveCopilotConfigDestination } from './config';

export class CopilotTarget implements Target {
  readonly name = 'copilot';
  readonly displayName = 'GitHub Copilot';
  readonly installHint = 'writes to .github/';

  // Copilot supports mcp (via .vscode/mcp.json) but NOT hook or settings — those are Claude Code only.
  // hook/settings absent from this list → existing warn-and-skip covers them.
  readonly supportedKinds: ArtifactKind[] = ['skill', 'agent', 'rule', 'prompt', 'workflow', 'mcp'];

  /** Directories created by `sigil init --target copilot`. */
  readonly initDirs: string[] = ['.github/instructions', '.github/prompts', '.github/agents'];

  /** Presence of .github/ signals this target is installed in the project. */
  readonly projectMarkers: string[] = ['.github'];

  /**
   * GitHub Copilot's native artifact vocabulary (verified June 2026).
   * A catalog `rule` maps to *instructions* on Copilot — "rule" is not a Copilot term.
   * A catalog `prompt` maps to a *prompt file* — "command" is not a Copilot artifact type.
   * Both platforms share the Agent Skills open standard for `skill`.
   */
  readonly vocabulary: Partial<Record<ArtifactKind, KindVocabulary>> = {
    skill: {
      noun: 'skill',
      plural: 'Skills',
      hint: 'Agent Skills (open standard, agentskills.io)',
    },
    agent: {
      noun: 'agent',
      plural: 'Agents',
      hint: 'custom agents (invoked as @name in Copilot Chat)',
    },
    rule: {
      noun: 'instructions',
      plural: 'Instructions',
      hint: 'coding guidelines (.instructions.md with applyTo)',
    },
    prompt: {
      noun: 'prompt',
      plural: 'Prompts',
      hint: 'prompt files invoked as /name in Copilot Chat',
    },
    workflow: { noun: 'prompt', plural: 'Prompts', hint: 'multi-step workflows as prompt files' },
    mcp: { noun: 'MCP server', plural: 'MCPs', hint: 'external MCP servers' },
  };

  /**
   * Copilot / VS Code config scopes, ordered by documented precedence (highest → lowest).
   * VS Code has NO distinct "local" MCP scope — project and local both resolve to the same
   * .vscode/mcp.json. So only two scopes are offered: Project (workspace) and User (profile).
   */
  configScopes(kinds: ConfigKind[], projectDir: string): ConfigScopeInfo[] {
    const SCOPES = [
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
    return SCOPES.map(sc => ({
      ...sc,
      label: sc.value,
      destinations: kinds
        .filter(k => k === 'mcp')
        .map(kind => {
          const d = resolveCopilotConfigDestination('mcp', sc.value);
          return {
            kind: kind as ConfigKind,
            file: d.file,
            root: d.root,
            fullPath: path.join(resolveConfigRoot(d.root, projectDir), d.file),
            // Copilot uses COPILOT_MCP_SERVERS_KEY (not 'mcpServers') — surface for display consistency.
            section: COPILOT_MCP_SERVERS_KEY,
          };
        }),
    }));
  }

  /**
   * Output-conformance contracts for Copilot scaffold output.
   * Checked by `build` and `add` after emit to enforce per-AI artifact shapes.
   */
  readonly outputContracts: ContractEntry[] = [
    {
      // Prompt file: agent + description required; no skill/Claude/instructions fields.
      match: /\.github\/prompts\/.*\.prompt\.md$/,
      label: 'Copilot prompt file',
      contract: {
        requiredKeys: ['agent', 'description'],
        forbiddenKeys: ['applyTo', 'name', 'paths', 'arguments', 'argument-hint'],
        bodyForbids: [
          {
            pattern: /\{\{/,
            reason: 'unresolved {{…}} placeholder (should be translated to ${input:name})',
          },
        ],
      },
    },
    {
      // Agent Skill (open standard): name + description only; no path-matching fields.
      match: /\.github\/skills\/.*\/SKILL\.md$/,
      label: 'Copilot Agent Skill',
      contract: {
        requiredKeys: ['name', 'description'],
        forbiddenKeys: ['applyTo', 'paths', 'agent'],
      },
    },
    {
      // Instructions file: applyTo required; no agent or name fields.
      match: /\.github\/instructions\/.*\.instructions\.md$/,
      label: 'Copilot instructions',
      contract: {
        requiredKeys: ['applyTo'],
        forbiddenKeys: ['name', 'agent'],
      },
    },
    {
      // Agent: name + description required; no path-matching or prompt fields.
      match: /\.github\/agents\/.*\.agent\.md$/,
      label: 'Copilot agent',
      contract: {
        requiredKeys: ['name', 'description'],
        forbiddenKeys: ['applyTo'],
      },
    },
  ];

  // ── Full build ───────────────────────────────────────────────────────────────

  async compile(catalog: ResolvedCatalog, _options: CompileOptions): Promise<FileMap> {
    const files: FileMap = {};

    const rules = catalog.artifacts.filter(a => a.kind === 'rule');
    const skills = catalog.artifacts.filter(a => a.kind === 'skill');
    const agents = catalog.artifacts.filter(a => a.kind === 'agent');
    const prompts = catalog.artifacts.filter(a => a.kind === 'prompt');
    const workflows = catalog.artifacts.filter(a => a.kind === 'workflow');

    // copilot-instructions.md: baseline shared rules
    const sharedRules = rules.filter(r => !r.frontmatter.language);
    if (sharedRules.length > 0) {
      files['.github/copilot-instructions.md'] = buildCopilotInstructions(sharedRules);
    }

    // instructions/*.instructions.md: language-specific rules
    const languageRules = rules.filter(r => r.frontmatter.language);
    for (const rule of languageRules) {
      const slug = rule.id.replace(/\//g, '-');
      files[`.github/instructions/${slug}.instructions.md`] = buildInstructionsFile(rule);
    }

    // skills/*/SKILL.md: native Agent Skills (open standard)
    for (const skill of skills) {
      const name = skill.frontmatter.name as string;
      files[`.github/skills/${name}/SKILL.md`] = buildSkillMd(skill);
      for (const ref of skill.references ?? []) {
        files[`.github/skills/${name}/references/${ref.name}`] = ref.content;
      }
    }

    // prompts/*.prompt.md: standalone prompts + workflows
    for (const prompt of prompts) {
      const slug = prompt.id.replace(/\//g, '-');
      files[`.github/prompts/${slug}.prompt.md`] = buildPromptFile(prompt);
    }
    for (const workflow of workflows) {
      const slug = workflow.id.replace(/\//g, '-');
      files[`.github/prompts/${slug}.prompt.md`] = buildPromptFile(workflow);
    }

    // AGENTS.md — pass catalog so Boundary sections can be rendered for co-present agents
    if (agents.length > 0) {
      files['.github/AGENTS.md'] = buildAgentsMd(agents, catalog);
    }

    return files;
  }

  // ── Scaffold (add command) ───────────────────────────────────────────────────

  async scaffold(
    artifactId: string,
    catalog: ResolvedCatalog,
    options: ScaffoldOptions,
  ): Promise<FileMap> {
    const artifact = catalog.byId.get(artifactId);
    if (!artifact) {
      throw new Error(`Artifact '${artifactId}' not found in the catalog`);
    }

    const files: FileMap = {};

    switch (artifact.kind) {
      case 'skill':
        scaffoldSkill(artifact, catalog, files, options);
        break;
      case 'agent':
        scaffoldAgent(artifact, files, catalog, options.coInstallSet);
        break;
      case 'rule':
        scaffoldRule(artifact, files);
        break;
      case 'prompt':
        scaffoldPrompt(artifact, files);
        break;
      case 'workflow':
        scaffoldWorkflow(artifact, files);
        break;
      default:
        throw new Error(`Scaffolding not supported for kind '${artifact.kind}'`);
    }

    return files;
  }

  // ── Config scaffold (mcp only — hook/settings are Claude Code-only) ──────────

  /**
   * Produce merge ops for mcp artifacts targeting VS Code / Copilot.
   *
   * Scope behaviour:
   *   project / local → .vscode/mcp.json   (workspace, root: project)
   *   user            → mcp.json in VS Code user-profile dir (root: vscode-user)
   *
   * Note: VS Code has no separate "local" MCP scope — `local` aliases to workspace.
   */
  async scaffoldConfig(
    artifactId: string,
    catalog: ResolvedCatalog,
    options: ScaffoldOptions,
  ): Promise<ConfigMergeOp[]> {
    const artifact = catalog.byId.get(artifactId);
    if (!artifact) {
      throw new Error(`Artifact '${artifactId}' not found in the catalog`);
    }

    if (artifact.kind !== 'mcp') {
      throw new Error(`Copilot scaffoldConfig only supports 'mcp' kind, got '${artifact.kind}'`);
    }

    const fm = artifact.frontmatter;
    const scope: ConfigScope =
      options.scope ?? (fm.defaultScope as ConfigScope | undefined) ?? 'project';
    const dest = resolveCopilotConfigDestination('mcp', scope);

    const server = fm.server as Record<string, unknown>;
    const serverName = (fm.name as string | undefined) ?? basenameOfId(artifact.id);
    const { description: _d, ...serverConfig } = server as Record<string, unknown>;
    void _d;

    // VS Code / Copilot uses COPILOT_MCP_SERVERS_KEY (not 'mcpServers' which is the Claude Code key)
    return [
      {
        file: dest.file,
        root: dest.root,
        fragment: { [COPILOT_MCP_SERVERS_KEY]: { [serverName]: serverConfig } },
        strategy: { [COPILOT_MCP_SERVERS_KEY]: 'object-spread' },
        section: COPILOT_MCP_SERVERS_KEY,
      },
    ];
  }
}
