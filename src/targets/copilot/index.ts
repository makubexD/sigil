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
 *   hook-ops       — buildCopilotHookOps (the flat hook entry Copilot reads)
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
import { COPILOT_AGENT_SKILLS_DOC } from '../doc-refs';
import { COPILOT_LEXICON } from './lexicon';
import { COPILOT_AGGREGATE_DOCS } from './aggregate-docs';
import type { ProviderLexicon } from '../lexicon';
import type { KindEmitSpec, SourcedDocRef } from '../spec-types';
import { scaffoldArtifact } from '../emit-files';
import { COPILOT_CAPABILITIES } from './capabilities';
import type { TargetCapabilities } from '../capability-types';
import { COPILOT_INIT_DIRS, COPILOT_PROJECT_MARKERS, COPILOT_VOCABULARY } from './metadata';
import { buildCopilotHookOps } from './hook-ops';
import {
  copilotScopesFor,
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
   * For mcp, Copilot has no distinct "local" scope — project and local both resolve to the
   * project's .mcp.json, so only Project and User are offered. A hook does have a distinct local
   * file (.github/copilot/settings.local.json), so Local joins the list for a hook selection.
   */
  configScopes(kinds: ConfigKind[], projectDir: string): ConfigScopeInfo[] {
    return copilotScopesFor(kinds).map(sc => ({
      ...sc,
      label: sc.value,
      destinations: buildScopeDestinations(kinds, sc.value, projectDir),
    }));
  }

  readonly outputContracts: ContractEntry[] = COPILOT_OUTPUT_CONTRACTS;
  readonly emitSpecs: readonly KindEmitSpec[] = COPILOT_EMIT_SPECS;
  readonly lexicon: ProviderLexicon = COPILOT_LEXICON;
  readonly aggregateDocs: readonly SourcedDocRef[] = COPILOT_AGGREGATE_DOCS;
  /** Probed on VS Code 1.125.1 (docs/audits/2026-10-06): `${NAME}` reaches the server as text. */
  readonly mcpEnvCaveat =
    'VS Code Copilot Chat does not expand ${NAME} in .mcp.json; it passes the text as is ' +
    '(Copilot CLI expands it), so a server that needs that value will not get it there. Do not ' +
    'write a secret into the file to work around it: the file is usually committed.';
  readonly retiredConfigDestinations: readonly RetiredConfigDestination[] =
    COPILOT_RETIRED_MCP_DESTINATIONS;
  /** Copilot reads project skills from .github/skills, .claude/skills and .agents/skills. */
  readonly alsoLoads = [
    {
      kind: 'skill' as const,
      targets: ['claude', 'agents-standard'],
      doc: COPILOT_AGENT_SKILLS_DOC,
    },
  ];

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

  // ── Config scaffold (mcp / hook — settings is Claude Code-only) ──────────────

  /**
   * Produce merge ops for mcp and hook artifacts targeting Copilot (VS Code and Copilot CLI).
   *
   * mcp scope behaviour:
   *   project / local → .mcp.json, root: project (VS Code, its Agent Host and Copilot CLI)
   *   user            → mcp-config.json, root: copilot-home ($COPILOT_HOME, default ~/.copilot)
   *
   * hook scope behaviour:
   *   project → .github/hooks/sigil.json, root: project
   *   local   → .github/copilot/settings.local.json, root: project
   *   user    → hooks/sigil.json, root: copilot-home
   *
   * Note: for mcp, Copilot has no separate "local" scope — `local` aliases to the project.
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

    if (artifact.kind !== 'mcp' && artifact.kind !== 'hook') {
      throw new Error(
        `Copilot scaffoldConfig only supports 'mcp' or 'hook' kind, got '${artifact.kind}'`,
      );
    }

    const scope: ConfigScope =
      options.scope ?? (artifact.frontmatter.defaultScope as ConfigScope | undefined) ?? 'project';
    return artifact.kind === 'hook'
      ? buildCopilotHookOps(artifact, scope)
      : buildMcpConfigOps(artifact, scope);
  }
}
