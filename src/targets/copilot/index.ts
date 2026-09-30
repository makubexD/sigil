/**
 * GitHub Copilot target adapter.
 *
 * Full build (compile): emits the .github/ directory layout that Copilot reads natively.
 *   dist/copilot/
 *     .github/
 *       copilot-instructions.md           ← repo-wide rules (no appliesTo, or every-file globs)
 *       instructions/<slug>.instructions.md ← every scoped rule, with or without a language
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
 *   config         — CopilotConfigDestination, resolveCopilotConfigDestination
 *   build-helpers  — buildCopilotInstructions, buildInstructionsFile, buildSkillMd,
 *                    buildPromptFile, buildAgentsMd
 *   scaffold       — scaffoldSkill, scaffoldRule, scaffoldAgent, scaffoldPrompt, scaffoldWorkflow
 *   mcp-key        — COPILOT_MCP_SERVERS_KEY
 *   target-helpers — free-standing helpers backing the class methods below
 */
export { COPILOT_MCP_SERVERS_KEY } from './mcp-key';

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
import { buildAgentsMd } from './build-helpers';
import { COPILOT_OUTPUT_CONTRACTS } from './contracts';
import { COPILOT_CAPABILITIES } from './capabilities';
import type { TargetCapabilities } from '../capability-types';
import { COPILOT_INIT_DIRS, COPILOT_PROJECT_MARKERS, COPILOT_VOCABULARY } from './metadata';
import {
  CONFIG_SCOPES,
  buildScopeDestinations,
  buildRuleFiles,
  buildSkillFiles,
  buildPromptFiles,
  scaffoldByKind,
  buildMcpConfigOps,
} from './target-helpers';

export { CopilotConfigDestination, resolveCopilotConfigDestination } from './config';

export class CopilotTarget implements Target {
  readonly name = 'copilot';
  readonly displayName = 'GitHub Copilot';
  readonly installHint = 'writes to .github/';

  readonly capabilities: TargetCapabilities = COPILOT_CAPABILITIES;
  readonly initDirs: string[] = COPILOT_INIT_DIRS;
  readonly projectMarkers: string[] = COPILOT_PROJECT_MARKERS;
  readonly vocabulary: Partial<Record<ArtifactKind, KindVocabulary>> = COPILOT_VOCABULARY;

  /**
   * Copilot / VS Code config scopes, ordered by documented precedence (highest → lowest).
   * VS Code has NO distinct "local" MCP scope — project and local both resolve to the same
   * .vscode/mcp.json. So only two scopes are offered: Project (workspace) and User (profile).
   */
  configScopes(kinds: ConfigKind[], projectDir: string): ConfigScopeInfo[] {
    return CONFIG_SCOPES.map(sc => ({
      ...sc,
      label: sc.value,
      destinations: buildScopeDestinations(kinds, sc.value, projectDir),
    }));
  }

  readonly outputContracts: ContractEntry[] = COPILOT_OUTPUT_CONTRACTS;

  // ── Full build ───────────────────────────────────────────────────────────────

  async compile(catalog: ResolvedCatalog, _options: CompileOptions): Promise<FileMap> {
    const files: FileMap = {};
    const byKind = (kind: ArtifactKind) => catalog.artifacts.filter(a => a.kind === kind);

    // Full build: every artifact in the catalog is co-present — same "all co-present" install
    // set buildAgentsMd already uses, so a skill's relatedArtifacts resolve the same way an
    // agent's do.
    const installSet = new Set(catalog.artifacts.map(a => a.id));

    buildRuleFiles(byKind('rule'), files);
    buildSkillFiles(byKind('skill'), files, catalog, installSet);
    buildPromptFiles(byKind('prompt'), byKind('workflow'), files);

    // AGENTS.md — pass catalog so Boundary sections can be rendered for co-present agents
    const agents = byKind('agent');
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
    scaffoldByKind(artifact, catalog, files, options);
    return files;
  }

  // ── Config scaffold (mcp only — hook/settings are Claude Code-only) ──────────

  /**
   * Produce merge ops for mcp artifacts targeting VS Code / Copilot.
   *
   * Scope behaviour:
   *   project / local → .vscode/mcp.json (VS Code) + .mcp.json (Copilot CLI), root: project
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

    const scope: ConfigScope =
      options.scope ?? (artifact.frontmatter.defaultScope as ConfigScope | undefined) ?? 'project';
    return buildMcpConfigOps(artifact, scope);
  }
}
