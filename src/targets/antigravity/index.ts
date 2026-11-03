/**
 * The Antigravity target.
 *
 * `build` (compile) writes the plugin layout under `dist/antigravity/plugins/<name>/`: one folder
 * per pack plus one generated plugin per hook and MCP artifact (./plugin-assemble.ts).
 *
 * `add` (scaffold) writes the same artifacts into the consumer project: Agent Skills in
 * `.agents/skills/<name>/SKILL.md`, the same files the open-standard and Codex targets write, with
 * each skill's rules inlined; repo-wide rules as `.agents/rules/` files; subagents as
 * `.agents/agents/` files; hooks merged into `.agents/hooks.json` (project) or
 * `~/.gemini/config/hooks.json` (user); and MCP servers merged into `.agents/mcp_config.json`
 * (project) or `~/.gemini/config/mcp_config.json` (user).
 * Everything here is data on the shared pipeline: emit specs, lexicon, capabilities and citations.
 * It needs nothing outside this folder except its `registerTarget()` line.
 *
 * `build` writes no `AGENTS.md`: an Antigravity repo-wide rule becomes an always-on
 * `.agents/rules/` file, which Antigravity loads, and Antigravity also reads a root `AGENTS.md`,
 * so writing both would load each rule twice. Per-file rules are also tracked by the manifest,
 * and an `AGENTS.md` written by `add` would not be
 * (docs/decisions/antigravity-target-2026-11.md, probe A1).
 *
 * @module
 */
import type {
  Artifact,
  ArtifactKind,
  CompileOptions,
  ConfigKind,
  ConfigMergeOp,
  ConfigScope,
  ConfigScopeInfo,
  ContractEntry,
  EnabledPluginsEnv,
  EnabledPluginsResult,
  FileMap,
  KindVocabulary,
  Pack,
  ResolvedCatalog,
  ScaffoldOptions,
  Target,
} from '../../types';
import { configScopesFrom, configSkipReasonFrom, scaffoldConfigFrom } from '../config-kind-table';
import type { TargetCapabilities } from '../capability-types';
import type { ProviderLexicon } from '../lexicon';
import type { HookInputDialect } from '../hook-input';
import type { KindEmitSpec, SourcedDocRef } from '../spec-types';
import { deriveContracts } from '../output-contract';
import { scaffoldArtifact } from '../emit-files';
import { ANTIGRAVITY_AGGREGATE_DOCS } from './aggregate-docs';
import { ANTIGRAVITY_CAPABILITIES } from './capabilities';
import { ANTIGRAVITY_CONFIG_KINDS } from './config';
import { ANTIGRAVITY_HOOK_INPUT } from './hook-dialect';
import { ANTIGRAVITY_LEXICON } from './lexicon';
import { ANTIGRAVITY_EMIT_SPECS } from './spec';
import { buildAntigravityPlugins } from './plugin-assemble';
import { antigravityPluginContents } from './plugin-contents';
import { readAntigravityEnabledPlugins } from './enabled-plugins';
import {
  ANTIGRAVITY_INIT_DIRS,
  ANTIGRAVITY_PROJECT_MARKERS,
  ANTIGRAVITY_VOCABULARY,
} from './metadata';

/** Antigravity config scopes, by the configuration files' documented resolution. */
const ANTIGRAVITY_CONFIG_SCOPES = [
  {
    value: 'project' as ConfigScope,
    precedence: 1,
    shared: true,
    blastRadius: 'project' as const,
    description: 'project — .agents/hooks.json and .agents/mcp_config.json, git-committed',
  },
  {
    value: 'user' as ConfigScope,
    precedence: 2,
    shared: false,
    blastRadius: 'all-projects' as const,
    description:
      'user — ~/.gemini/config/hooks.json and ~/.gemini/config/mcp_config.json, all projects',
  },
];

/**
 * The Antigravity adapter. `compile` builds the plugin layout under
 * `dist/antigravity/plugins/<name>/`; `scaffold` writes project files under `.agents/`.
 */
export class AntigravityTarget implements Target {
  readonly name = 'antigravity';
  readonly displayName = 'Antigravity';
  readonly installHint = 'writes to .agents/';
  readonly afterInstallHint =
    'Antigravity picks up .agents/skills/, .agents/rules/ and .agents/agents/ in its next session. Hooks in .agents/hooks.json load in the next session. An MCP tool runs only after approval or an allow rule such as mcp(<server>/*).';
  /**
   * Antigravity's MCP files expand no references, so an identity env entry is dropped and the
   * server reads the variable from `agy`'s own environment (ADR P5, C1).
   */
  readonly mcpEnvCaveat =
    'Antigravity expands no variables in its MCP files; the server inherits agy’s environment, ' +
    'so export each of these before you start agy. Do not write a secret into the file instead: ' +
    '.agents/mcp_config.json is usually committed.';

  readonly sharesSkillFilesWith = ['agents-standard', 'codex'];
  readonly capabilities: TargetCapabilities = ANTIGRAVITY_CAPABILITIES;
  readonly initDirs: string[] = ANTIGRAVITY_INIT_DIRS;
  readonly projectMarkers: string[] = ANTIGRAVITY_PROJECT_MARKERS;
  readonly vocabulary: Partial<Record<ArtifactKind, KindVocabulary>> = ANTIGRAVITY_VOCABULARY;
  readonly emitSpecs: readonly KindEmitSpec[] = ANTIGRAVITY_EMIT_SPECS;
  readonly outputContracts: ContractEntry[] = deriveContracts(ANTIGRAVITY_EMIT_SPECS);
  readonly lexicon: ProviderLexicon = ANTIGRAVITY_LEXICON;
  readonly hookInput: HookInputDialect = ANTIGRAVITY_HOOK_INPUT;
  readonly aggregateDocs: readonly SourcedDocRef[] = ANTIGRAVITY_AGGREGATE_DOCS;

  readonly configKinds = ANTIGRAVITY_CONFIG_KINDS;

  /**
   * Antigravity config scopes, by the configuration files' documented resolution. Neither file
   * overrides the other: on a server name present in both, the server already running keeps it
   * (ANTIGRAVITY_SETTINGS_DOC, probe C1 in docs/decisions/antigravity-target-2026-11.md). Hooks
   * follow the same project/user split. Antigravity has no personal per-project hooks or MCP
   * file, so only project and user are offered.
   */
  configScopes(kinds: ConfigKind[], projectDir: string): ConfigScopeInfo[] {
    return configScopesFrom(this.configKinds, ANTIGRAVITY_CONFIG_SCOPES, kinds, projectDir);
  }

  // ── Config scaffold (hook / mcp — settings is Claude Code's vocabulary) ────

  /**
   * Produce the merge ops for a hook or mcp artifact targeting Antigravity: `.agents/hooks.json` /
   * `.agents/mcp_config.json` (project) or `~/.gemini/config/hooks.json` /
   * `~/.gemini/config/mcp_config.json` (user). The install scope is resolved in order:
   * options.scope → fm.defaultScope → 'project'.
   */
  async scaffoldConfig(
    artifactId: string,
    catalog: ResolvedCatalog,
    options: ScaffoldOptions,
  ): Promise<ConfigMergeOp[]> {
    const artifact = catalog.byId.get(artifactId);
    if (!artifact) throw new Error(`Artifact '${artifactId}' not found in the catalog`);
    return scaffoldConfigFrom(this.configKinds, artifact, options, 'Antigravity');
  }

  /**
   * A config artifact Antigravity cannot render is skipped with this reason, not an error: a hook
   * whose event or matcher has no Antigravity equivalent would match nothing.
   */
  configSkipReason(artifact: Artifact): string | undefined {
    return configSkipReasonFrom(this.configKinds, artifact);
  }

  /**
   * Antigravity plugins installed for this project or the user: regular folders under
   * `.agents/plugins/` and `~/.gemini/config/plugins/` whose own `plugin.json` names them, minus
   * those `config.json` disables (src/targets/antigravity/enabled-plugins.ts).
   */
  enabledPlugins(env: EnabledPluginsEnv): EnabledPluginsResult {
    return readAntigravityEnabledPlugins(env);
  }

  /**
   * What each plugin of the Antigravity plugin layout holds, from the same pack membership and
   * config plugin selection `compile` writes (src/targets/antigravity/plugin-contents.ts).
   */
  marketplacePluginContents(
    catalog: ResolvedCatalog,
    packs: Pack[],
  ): ReadonlyMap<string, readonly string[]> {
    return antigravityPluginContents(catalog, packs);
  }

  /** The plugin layout: one folder per pack, plus one generated plugin per hook and MCP artifact. */
  async compile(catalog: ResolvedCatalog, options: CompileOptions): Promise<FileMap> {
    return buildAntigravityPlugins(catalog, options);
  }

  async scaffold(
    artifactId: string,
    catalog: ResolvedCatalog,
    options: ScaffoldOptions,
  ): Promise<FileMap> {
    const artifact = catalog.byId.get(artifactId);
    if (!artifact) throw new Error(`Artifact '${artifactId}' not found in the catalog`);
    return scaffoldArtifact({ specs: this.emitSpecs, artifact, catalog, options });
  }
}
