/**
 * Claude Code target adapter.
 *
 * Full build (compile): generates a git-based marketplace layout under dist/claude/.
 *   dist/claude/
 *     .claude-plugin/marketplace.json     ← /plugin marketplace add ./dist/claude
 *     plugins/
 *       <pack-name>/
 *         .claude-plugin/plugin.json
 *         skills/<skill-name>/SKILL.md    ← rule bodies inlined as "## Applied Rules"
 *                                            (also holds prompt/workflow kinds, disable-model-invocation)
 *         agents/<agent-name>.md          ← claude: frontmatter applied
 *
 * Scaffold (add): writes into the consumer's .claude/ directory using Claude Code's
 *   native project-scope layout, where rules are first-class (.claude/rules/*.md).
 *   .claude/
 *     skills/<skill-name>/SKILL.md
 *     rules/<rule-name>.md
 *     agents/<agent-name>.md
 *
 * NOTE on rules in plugin build vs. scaffold:
 *   Claude Code plugins cannot ship loose rules — they only load context via skills/agents/hooks.
 *   So in the plugin build we fold rule bodies into the skill's SKILL.md.
 *   In the scaffold build we write rules to .claude/rules/*.md, which Claude Code loads natively.
 *
 * Sub-modules:
 *   config          — ConfigDestination, resolveClaudeConfigDestination
 *   plugin-build    — getPackArtifacts, buildPluginSkillMd, buildAgentMd, buildWorkflowMd
 *   plugin-assemble — buildPlugin (assembles a pack's full FileMap)
 *   scaffold        — scaffoldSkill, scaffoldRule, scaffoldAgent, scaffoldPrompt, scaffoldWorkflow
 *   target-helpers  — free-standing helpers backing the class methods below
 */
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
  AuthoringField,
} from '../../types';
import { resolveClaudeConfigDestination } from './config';
import {
  CONFIG_SCOPES,
  buildScopeDestination,
  buildMarketplaceJson,
  buildOnePackPlugin,
  scaffoldByKind,
  scaffoldConfigByKind,
} from './target-helpers';
import {
  CLAUDE_AUTHORING_FIELDS,
  CLAUDE_INIT_DIRS,
  CLAUDE_PROJECT_MARKERS,
  CLAUDE_VOCABULARY,
} from './metadata';
import { CLAUDE_OUTPUT_CONTRACTS } from './contracts';
import { CLAUDE_CAPABILITIES } from './capabilities';
import type { TargetCapabilities } from '../capability-types';

export { ConfigDestination, resolveClaudeConfigDestination } from './config';

export class ClaudeCodeTarget implements Target {
  readonly name = 'claude';
  readonly displayName = 'Claude Code';
  readonly installHint = 'writes to .claude/';

  readonly authoringFields: AuthoringField[] = CLAUDE_AUTHORING_FIELDS;
  readonly capabilities: TargetCapabilities = CLAUDE_CAPABILITIES;
  readonly initDirs: string[] = CLAUDE_INIT_DIRS;
  readonly projectMarkers: string[] = CLAUDE_PROJECT_MARKERS;
  readonly vocabulary: Partial<Record<ArtifactKind, KindVocabulary>> = CLAUDE_VOCABULARY;

  /**
   * Claude Code config scopes, ordered by documented precedence (highest → lowest).
   * Ref: https://code.claude.com/docs/en/settings
   *   Local (highest overrides) → Project (team-shared) → User (lowest priority)
   *
   * Each destination's fullPath is pre-resolved so the wizard can display it without
   * any provider-specific branching. The mcp 'local' scope writes into ~/.claude.json
   * under a per-project key, NOT into the repo — surfaced here so users understand why
   * nothing appears in their project directory.
   */
  configScopes(kinds: ConfigKind[], projectDir: string): ConfigScopeInfo[] {
    return CONFIG_SCOPES.map(sc => ({
      ...sc,
      label: sc.value,
      destinations: kinds.map(kind => buildScopeDestination(kind, sc.value, projectDir)),
    }));
  }

  readonly outputContracts: ContractEntry[] = CLAUDE_OUTPUT_CONTRACTS;

  // ── Full build ───────────────────────────────────────────────────────────────

  async compile(catalog: ResolvedCatalog, options: CompileOptions): Promise<FileMap> {
    const files: FileMap = {};
    const pluginEntries: Array<{
      name: string;
      displayName: string;
      description: string;
      source: string;
    }> = [];

    for (const pack of options.packs) {
      const { files: pluginFiles, entry } = buildOnePackPlugin(pack, catalog, options);
      Object.assign(files, pluginFiles);
      pluginEntries.push(entry);
    }

    files['.claude-plugin/marketplace.json'] = buildMarketplaceJson(
      pluginEntries,
      options.homepage,
    );
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

  // ── Config scaffold (hook / settings / mcp) ──────────────────────────────────

  /**
   * Produce merge ops for config-kind artifacts.
   * Called by `sigil add` when the artifact is a hook, settings, or mcp kind.
   * Returns ConfigMergeOp[] describing how to merge into the user's JSON config files.
   *
   * The install scope is resolved in order: options.scope → fm.defaultScope → 'project'.
   * The resulting op carries `root` so the CLI knows which root directory to resolve.
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

    const fm = artifact.frontmatter;
    const scope: ConfigScope =
      options.scope ?? (fm.defaultScope as ConfigScope | undefined) ?? 'project';
    const dest = resolveClaudeConfigDestination(
      artifact.kind as 'hook' | 'settings' | 'mcp',
      scope,
      options.projectDir,
    );
    return scaffoldConfigByKind(artifact, dest);
  }
}
