/**
 * The OpenCode target: Agent Skills in the shared `.agents/skills/`, which OpenCode reads as-is,
 * subagents in `.opencode/agents/`, commands in `.opencode/commands/`, repo-wide rules in the
 * root `AGENTS.md` on a full build, and MCP servers merged into `.opencode/opencode.json`
 * (project) or `$XDG_CONFIG_HOME/opencode/opencode.json` (user). Everything here is data on the
 * shared pipeline: emit specs, lexicon, capabilities and citations. It needs nothing outside this
 * folder except its `registerTarget()` line.
 *
 * The open-standard target, Codex and Antigravity write the same `.agents/skills/` files, so a
 * project uses one of the four for skills (Target.sharesSkillFilesWith).
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
  FileMap,
  KindVocabulary,
  ResolvedCatalog,
  ScaffoldOptions,
  Target,
} from '../../types';
import {
  configScopesFrom,
  configSkipReasonFrom,
  scaffoldConfigFrom,
  type ConfigKindTable,
} from '../config-kind-table';
import type { TargetCapabilities } from '../capability-types';
import type { ProviderLexicon } from '../lexicon';
import type { KindEmitSpec, SourcedDocRef } from '../spec-types';
import { deriveContracts } from '../output-contract';
import { emitFile, scaffoldArtifact, specFor } from '../emit-files';
import { isRepoWideRule, renderRulesDocument } from '../shared/repo-wide-rules';
import { OPENCODE_CAPABILITIES } from './capabilities';
import { OPENCODE_CONFIG_KINDS } from './config';
import { OPENCODE_LEXICON } from './lexicon';
import { OPENCODE_EMIT_SPECS } from './spec';
import { OPENCODE_AGGREGATE_DOCS } from './aggregate-docs';
import { OPENCODE_SKILLS_DOC } from './doc-refs';
import { OPENCODE_INIT_DIRS, OPENCODE_PROJECT_MARKERS, OPENCODE_VOCABULARY } from './metadata';

/** OpenCode config scopes, ordered by documented precedence (project overrides user). */
const OPENCODE_CONFIG_SCOPES = [
  {
    value: 'project' as ConfigScope,
    precedence: 1,
    shared: true,
    blastRadius: 'project' as const,
    description: 'project — .opencode/opencode.json, git-committed',
  },
  {
    value: 'user' as ConfigScope,
    precedence: 2,
    shared: false,
    blastRadius: 'all-projects' as const,
    description: 'user — ~/.config/opencode/opencode.json, all projects',
  },
];

export class OpenCodeTarget implements Target {
  readonly name = 'opencode';
  readonly displayName = 'OpenCode';
  readonly installHint = 'writes to .agents/skills/ and .opencode/';
  readonly afterInstallHint =
    'OpenCode picks them up in its next session, MCP servers included. Do not also install the same skills with --target agents-standard, codex or antigravity: they write the same .agents/skills/ files.';

  /**
   * OpenCode replaces each reference with the variable's raw value when it reads the file: an
   * unset variable becomes an empty string with no error, and a value holding `"` breaks the file.
   */
  readonly mcpEnvCaveat =
    'OpenCode reads each one when it starts: an unset variable becomes an empty string with no ' +
    'error, and a value holding a double quote stops OpenCode from loading the file. Export ' +
    'them first. Do not write a secret into the file instead: .opencode/opencode.json is usually ' +
    'committed.';

  readonly sharesSkillFilesWith = ['agents-standard', 'codex', 'antigravity'];
  readonly capabilities: TargetCapabilities = OPENCODE_CAPABILITIES;
  readonly initDirs: string[] = OPENCODE_INIT_DIRS;
  readonly projectMarkers: string[] = OPENCODE_PROJECT_MARKERS;
  readonly vocabulary: Partial<Record<ArtifactKind, KindVocabulary>> = OPENCODE_VOCABULARY;
  readonly emitSpecs: readonly KindEmitSpec[] = OPENCODE_EMIT_SPECS;
  readonly outputContracts: ContractEntry[] = deriveContracts(OPENCODE_EMIT_SPECS);
  readonly lexicon: ProviderLexicon = OPENCODE_LEXICON;
  readonly aggregateDocs: readonly SourcedDocRef[] = OPENCODE_AGGREGATE_DOCS;

  /**
   * OpenCode also reads `.claude/skills/` next to the `.agents/skills/` it writes; one entry reaches
   * it, and which copy it shows on a name clash isn't fixed on OpenCode 1, while OpenCode 2 documents
   * `.agents/skills/` winning (D2, docs/decisions/opencode-target-2026-11.md).
   */
  readonly alsoLoads = [
    {
      kind: 'skill' as const,
      targets: ['claude'],
      doc: OPENCODE_SKILLS_DOC,
      unfixedWinner: true,
    },
  ];

  readonly configKinds: ConfigKindTable = OPENCODE_CONFIG_KINDS;

  /** OpenCode config scopes, ordered by documented precedence (project overrides user). */
  configScopes(kinds: ConfigKind[], projectDir: string): ConfigScopeInfo[] {
    return configScopesFrom(this.configKinds, OPENCODE_CONFIG_SCOPES, kinds, projectDir);
  }

  // ── Config scaffold (mcp only: OpenCode takes no hook or settings kind) ─────

  /**
   * Produce the merge ops for an mcp artifact targeting OpenCode: `.opencode/opencode.json`
   * (project) or `$XDG_CONFIG_HOME/opencode/opencode.json` (user). The install scope is resolved
   * in order: options.scope → fm.defaultScope → 'project'.
   */
  async scaffoldConfig(
    artifactId: string,
    catalog: ResolvedCatalog,
    options: ScaffoldOptions,
  ): Promise<ConfigMergeOp[]> {
    const artifact = catalog.byId.get(artifactId);
    if (!artifact) throw new Error(`Artifact '${artifactId}' not found in the catalog`);
    return scaffoldConfigFrom(this.configKinds, artifact, options, 'OpenCode');
  }

  /** An mcp artifact OpenCode cannot render is skipped with this reason, not an error. */
  configSkipReason(artifact: Artifact): string | undefined {
    return configSkipReasonFrom(OPENCODE_CONFIG_KINDS, artifact);
  }

  /** Every skill, agent and shippable prompt (whole catalog co-installed) and AGENTS.md with repo-wide rules. */
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
