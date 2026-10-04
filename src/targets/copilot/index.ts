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
 *   build-helpers  — buildCopilotInstructions, buildAgentsMd (the two aggregates)
 *   spec/          — one KindEmitSpec per kind (COPILOT_EMIT_SPECS = emitSpecs); every
 *                    per-artifact file is written through ../emit-files.ts with these
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
  RetiredConfigDestination,
} from '../../types';
import { buildAgentsMd } from './build-helpers';
import { COPILOT_OUTPUT_CONTRACTS } from './contracts';
import { COPILOT_EMIT_SPECS } from './spec';
import { COPILOT_RETIRED_MCP_DESTINATIONS } from './config';
import { COPILOT_LEXICON } from './lexicon';
import { COPILOT_AGGREGATE_DOCS } from './aggregate-docs';
import type { ProviderLexicon } from '../lexicon';
import type { KindEmitSpec, SourcedDocRef } from '../spec-types';
import { scaffoldArtifact } from '../emit-files';
import { COPILOT_CAPABILITIES } from './capabilities';
import type { TargetCapabilities } from '../capability-types';
import { COPILOT_INIT_DIRS, COPILOT_PROJECT_MARKERS, COPILOT_VOCABULARY } from './metadata';
import {
  CONFIG_SCOPES,
  buildScopeDestinations,
  buildArtifactFiles,
  buildMcpConfigOps,
} from './target-helpers';

export { CopilotConfigDestination, resolveCopilotConfigDestination } from './config';

export class CopilotTarget implements Target {
  readonly name = 'copilot';
  readonly displayName = 'GitHub Copilot';
  readonly installHint = 'writes to .github/';
  readonly afterInstallHint =
    'in VS Code run "Developer: Reload Window" so Copilot Chat loads the new files. Prompts run as /name, agents as @name.';

  readonly capabilities: TargetCapabilities = COPILOT_CAPABILITIES;
  readonly initDirs: string[] = COPILOT_INIT_DIRS;
  readonly projectMarkers: string[] = COPILOT_PROJECT_MARKERS;
  readonly vocabulary: Partial<Record<ArtifactKind, KindVocabulary>> = COPILOT_VOCABULARY;

  /**
   * Copilot / VS Code config scopes, ordered by documented precedence (highest → lowest).
   * Copilot has no distinct "local" MCP scope — project and local both resolve to the project's
   * .mcp.json. So only two scopes are offered: Project (.mcp.json) and User (mcp-config.json).
   */
  configScopes(kinds: ConfigKind[], projectDir: string): ConfigScopeInfo[] {
    return CONFIG_SCOPES.map(sc => ({
      ...sc,
      label: sc.value,
      destinations: buildScopeDestinations(kinds, sc.value, projectDir),
    }));
  }

  readonly outputContracts: ContractEntry[] = COPILOT_OUTPUT_CONTRACTS;
  readonly emitSpecs: readonly KindEmitSpec[] = COPILOT_EMIT_SPECS;
  readonly lexicon: ProviderLexicon = COPILOT_LEXICON;
  readonly aggregateDocs: readonly SourcedDocRef[] = COPILOT_AGGREGATE_DOCS;
  readonly retiredConfigDestinations: readonly RetiredConfigDestination[] =
    COPILOT_RETIRED_MCP_DESTINATIONS;

  // ── Full build ───────────────────────────────────────────────────────────────

  async compile(catalog: ResolvedCatalog, _options: CompileOptions): Promise<FileMap> {
    const files: FileMap = {};
    buildArtifactFiles(catalog, this.emitSpecs, files);

    // AGENTS.md — pass catalog so Boundary sections can be rendered for co-present agents
    const agents = catalog.artifacts.filter(a => a.kind === 'agent');
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

    return scaffoldArtifact({ specs: this.emitSpecs, artifact, catalog, options });
  }

  // ── Config scaffold (mcp only — hook/settings are Claude Code-only) ──────────

  /**
   * Produce merge ops for mcp artifacts targeting Copilot (VS Code and Copilot CLI).
   *
   * Scope behaviour:
   *   project / local → .mcp.json, root: project (VS Code, its Agent Host and Copilot CLI)
   *   user            → mcp-config.json, root: copilot-home ($COPILOT_HOME, default ~/.copilot)
   *
   * Note: Copilot has no separate "local" MCP scope — `local` aliases to the project.
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
