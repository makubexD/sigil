/**
 * The Codex target: Agent Skills in `.agents/skills/<name>/SKILL.md`, the open-standard layout
 * Codex loads, plus a root `AGENTS.md` with the repo-wide rules on a full build, hooks merged into
 * `.codex/hooks.json` / `$CODEX_HOME/hooks.json`, and MCP servers merged into `.codex/config.toml`
 * / `$CODEX_HOME/config.toml`. Everything here is data on the shared pipeline: emit specs, lexicon,
 * capabilities and citations. It needs nothing outside this folder except its `registerTarget()` line.
 *
 * The agents-standard target writes the same `.agents/skills/` files. The two render them
 * identically, so one tool loads each skill once and either install can be removed on its own.
 *
 * @module
 */
import path from 'path';
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
import { resolveConfigRoot } from '../../config-utils';
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
import { buildCodexHookOps } from './hook-ops';
import { buildCodexMcpOps } from './mcp-ops';
import { resolveCodexConfigDestination } from './config';

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

/** The JSON key-path each config kind's fragment lands at, for the scope-menu hint. */
const CONFIG_KIND_SECTIONS: Record<'hook' | 'mcp', string> = {
  hook: 'hooks',
  mcp: 'mcp_servers',
};

export class CodexTarget implements Target {
  readonly name = 'codex';
  readonly displayName = 'OpenAI Codex';
  readonly installHint = 'writes to .agents/skills/';
  readonly afterInstallHint =
    'Codex picks up .agents/skills/ in its next session. Run it in a trusted project: an untrusted one skips AGENTS.md and .codex/ config. Review hooks with /hooks before they run — Codex skips a hook until then.';

  readonly capabilities: TargetCapabilities = CODEX_CAPABILITIES;
  readonly initDirs: string[] = CODEX_INIT_DIRS;
  readonly projectMarkers: string[] = CODEX_PROJECT_MARKERS;
  readonly vocabulary: Partial<Record<ArtifactKind, KindVocabulary>> = CODEX_VOCABULARY;
  readonly emitSpecs: readonly KindEmitSpec[] = CODEX_EMIT_SPECS;
  readonly outputContracts: ContractEntry[] = deriveContracts(CODEX_EMIT_SPECS);
  readonly lexicon: ProviderLexicon = CODEX_LEXICON;
  readonly aggregateDocs: readonly SourcedDocRef[] = CODEX_AGGREGATE_DOCS;

  /**
   * Codex config scopes, ordered by documented precedence (project overrides user). Codex has no
   * distinct "local" config file, so only Project and User are offered.
   */
  configScopes(kinds: ConfigKind[], projectDir: string): ConfigScopeInfo[] {
    return CODEX_CONFIG_SCOPES.map(sc => ({
      ...sc,
      label: sc.value,
      destinations: kinds
        .filter(kind => kind === 'hook' || kind === 'mcp')
        .map(kind => {
          const dest = resolveCodexConfigDestination(kind, sc.value);
          return {
            kind,
            file: dest.file,
            root: dest.root,
            fullPath: path.join(resolveConfigRoot(dest.root, projectDir), dest.file),
            section: CONFIG_KIND_SECTIONS[kind],
          };
        }),
    }));
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
    if (artifact.kind !== 'hook' && artifact.kind !== 'mcp') {
      throw new Error(
        `Codex scaffoldConfig only supports the 'hook' and 'mcp' kinds, got '${artifact.kind}'`,
      );
    }
    const scope: ConfigScope =
      options.scope ?? (artifact.frontmatter.defaultScope as ConfigScope | undefined) ?? 'project';
    return artifact.kind === 'hook'
      ? buildCodexHookOps(artifact, scope)
      : buildCodexMcpOps(artifact, scope);
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
