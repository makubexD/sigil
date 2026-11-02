/**
 * The Codex target: Agent Skills in `.agents/skills/<name>/SKILL.md`, the open-standard layout
 * Codex loads, plus a root `AGENTS.md` with the repo-wide rules on a full build, hooks merged into
 * `.codex/hooks.json` / `$CODEX_HOME/hooks.json`, and MCP servers merged into `.codex/config.toml`
 * / `$CODEX_HOME/config.toml`. Everything here is data on the shared pipeline: emit specs, lexicon,
 * capabilities and citations. It needs nothing outside this folder except its `registerTarget()` line.
 *
 * The agents-standard and antigravity targets write the same `.agents/skills/` files, so a project
 * uses one of the three for skills (Target.sharesSkillFilesWith).
 *
 * @module
 */
import type {
  ArtifactKind,
  CompileOptions,
  ConfigKind,
  ConfigMergeOp,
  ConfigScope,
  ConfigScopeInfo,
  ContractEntry,
  FileMap,
  KindVocabulary,
  ResolvedCatalog,
  ScaffoldOptions,
  Target,
} from '../../types';
import { configScopesFrom, scaffoldConfigFrom } from '../config-kind-table';
import type { TargetCapabilities } from '../capability-types';
import type { ProviderLexicon } from '../lexicon';
import type { KindEmitSpec, SourcedDocRef } from '../spec-types';
import { deriveContracts } from '../output-contract';
import { emitFile, scaffoldArtifact, specFor } from '../emit-files';
import { isRepoWideRule, renderRulesDocument } from '../shared/repo-wide-rules';
import { CODEX_CAPABILITIES } from './capabilities';
import { CODEX_LEXICON } from './lexicon';
import { CODEX_EMIT_SPECS } from './spec';
import { CODEX_AGGREGATE_DOCS } from './aggregate-docs';
import { CODEX_INIT_DIRS, CODEX_PROJECT_MARKERS, CODEX_VOCABULARY } from './metadata';
import { CODEX_CONFIG_KINDS } from './config';

export { CodexConfigDestination, resolveCodexConfigDestination } from './config';

/** Codex config scopes, ordered by documented precedence (project overrides user). */
const CODEX_CONFIG_SCOPES = [
  {
    value: 'project' as ConfigScope,
    precedence: 1,
    shared: true,
    blastRadius: 'project' as const,
    description: 'workspace — .codex/ config files, git-committed',
  },
  {
    value: 'user' as ConfigScope,
    precedence: 2,
    shared: false,
    blastRadius: 'all-projects' as const,
    description: 'user — $CODEX_HOME config files (default ~/.codex), all projects',
  },
];

export class CodexTarget implements Target {
  readonly name = 'codex';
  readonly displayName = 'OpenAI Codex';
  readonly installHint = 'writes to .agents/skills/';
  readonly afterInstallHint =
    'Codex picks up .agents/skills/ in its next session. Run it in a trusted project: an untrusted one skips AGENTS.md and .codex/ config. Review hooks with /hooks before they run — Codex skips a hook until then.';

  readonly sharesSkillFilesWith = ['agents-standard', 'antigravity'];
  readonly capabilities: TargetCapabilities = CODEX_CAPABILITIES;
  readonly initDirs: string[] = CODEX_INIT_DIRS;
  readonly projectMarkers: string[] = CODEX_PROJECT_MARKERS;
  readonly vocabulary: Partial<Record<ArtifactKind, KindVocabulary>> = CODEX_VOCABULARY;
  readonly emitSpecs: readonly KindEmitSpec[] = CODEX_EMIT_SPECS;
  readonly outputContracts: ContractEntry[] = deriveContracts(CODEX_EMIT_SPECS);
  readonly lexicon: ProviderLexicon = CODEX_LEXICON;
  readonly aggregateDocs: readonly SourcedDocRef[] = CODEX_AGGREGATE_DOCS;

  readonly configKinds = CODEX_CONFIG_KINDS;

  /**
   * Codex config scopes, ordered by documented precedence (project overrides user). Codex has no
   * distinct "local" config file, so only Project and User are offered.
   */
  configScopes(kinds: ConfigKind[], projectDir: string): ConfigScopeInfo[] {
    return configScopesFrom(this.configKinds, CODEX_CONFIG_SCOPES, kinds, projectDir);
  }

  // ── Config scaffold (hook / mcp — settings is Claude Code's vocabulary) ─────

  /**
   * Produce the merge op for a hook or mcp artifact targeting Codex: `.codex/hooks.json` /
   * `.codex/config.toml` (project) or `$CODEX_HOME/hooks.json` / `$CODEX_HOME/config.toml` (user).
   * The install scope is resolved in order: options.scope → fm.defaultScope → 'project'.
   */
  async scaffoldConfig(
    artifactId: string,
    catalog: ResolvedCatalog,
    options: ScaffoldOptions,
  ): Promise<ConfigMergeOp[]> {
    const artifact = catalog.byId.get(artifactId);
    if (!artifact) throw new Error(`Artifact '${artifactId}' not found in the catalog`);
    return scaffoldConfigFrom(this.configKinds, artifact, options, 'Codex');
  }

  /** Every skill (rules inlined, the whole catalog co-installed) and AGENTS.md with repo-wide rules. */
  async compile(catalog: ResolvedCatalog, _options: CompileOptions): Promise<FileMap> {
    const files: FileMap = {};
    const ctx = { catalog, installSet: new Set(catalog.artifacts.map(a => a.id)) };
    for (const artifact of catalog.artifacts) {
      const spec = specFor(this.emitSpecs, artifact.kind, 'scaffold');
      if (spec) emitFile(spec, artifact, ctx, files);
    }
    const rules = catalog.artifacts.filter(a => a.kind === 'rule' && isRepoWideRule(a));
    if (rules.length > 0)
      files['AGENTS.md'] = renderRulesDocument('# AGENTS.md', rules, this.lexicon);
    return files;
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
