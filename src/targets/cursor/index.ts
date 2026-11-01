/**
 * The Cursor target: Agent Skills in `.cursor/skills/<name>/SKILL.md` (each skill's rules inlined
 * into it), project rules as `.mdc` files in `.cursor/rules/`, and hooks merged into
 * `.cursor/hooks.json` (project) or `~/.cursor/hooks.json` (user). Everything here is data on the
 * shared pipeline: emit specs, lexicon, capabilities and citations. It needs nothing outside this
 * folder except its `registerTarget()` line.
 *
 * `build` writes no `AGENTS.md`: Cursor's native repo-wide rules become `.mdc` files in
 * `.cursor/rules/`, and Cursor also reads a root `AGENTS.md`, so writing both would load each
 * rule twice (docs/decisions/cursor-target-2026-11.md § Phase B).
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
import { configScopesFrom, configSkipReasonFrom, scaffoldConfigFrom } from '../config-kind-table';
import type { TargetCapabilities } from '../capability-types';
import type { ProviderLexicon } from '../lexicon';
import type { KindEmitSpec, SourcedDocRef } from '../spec-types';
import { deriveContracts } from '../output-contract';
import { emitFile, scaffoldArtifact, specFor } from '../emit-files';
import { CURSOR_AGGREGATE_DOCS } from './aggregate-docs';
import { CURSOR_CAPABILITIES } from './capabilities';
import { CURSOR_CONFIG_KINDS } from './config';
import { CURSOR_SKILLS_DOC } from './doc-refs';
import { CURSOR_LEXICON } from './lexicon';
import { CURSOR_EMIT_SPECS } from './spec';
import { CURSOR_INIT_DIRS, CURSOR_PROJECT_MARKERS, CURSOR_VOCABULARY } from './metadata';

/** Cursor config scopes, ordered by documented precedence (project overrides user). */
const CURSOR_CONFIG_SCOPES = [
  {
    value: 'project' as ConfigScope,
    precedence: 1,
    shared: true,
    blastRadius: 'project' as const,
    description: 'project — .cursor/hooks.json, git-committed',
  },
  {
    value: 'user' as ConfigScope,
    precedence: 2,
    shared: false,
    blastRadius: 'all-projects' as const,
    description: 'user — ~/.cursor/hooks.json, all projects',
  },
];

export class CursorTarget implements Target {
  readonly name = 'cursor';
  readonly displayName = 'Cursor';
  readonly installHint = 'writes to .cursor/';
  readonly afterInstallHint =
    'Cursor picks up .cursor/skills/ and .cursor/rules/ in its next chat. Project hooks run only in a trusted workspace.';

  readonly capabilities: TargetCapabilities = CURSOR_CAPABILITIES;
  readonly initDirs: string[] = CURSOR_INIT_DIRS;
  readonly projectMarkers: string[] = CURSOR_PROJECT_MARKERS;
  readonly vocabulary: Partial<Record<ArtifactKind, KindVocabulary>> = CURSOR_VOCABULARY;
  readonly emitSpecs: readonly KindEmitSpec[] = CURSOR_EMIT_SPECS;
  readonly outputContracts: ContractEntry[] = deriveContracts(CURSOR_EMIT_SPECS);
  readonly lexicon: ProviderLexicon = CURSOR_LEXICON;
  readonly aggregateDocs: readonly SourcedDocRef[] = CURSOR_AGGREGATE_DOCS;

  /**
   * Cursor also reads `.claude/skills/` and `.agents/skills/`, and its own `.cursor/skills/` copy
   * wins on a name clash: the other copy goes unused rather than loading twice (ADR
   * docs/decisions/cursor-target-2026-11.md A3 for Claude Code, Phase B run 2 for `.agents/`).
   */
  readonly alsoLoads = [
    { kind: 'skill' as const, targets: ['claude'], doc: CURSOR_SKILLS_DOC, readerWins: true },
    {
      kind: 'skill' as const,
      targets: ['agents-standard', 'codex'],
      doc: CURSOR_SKILLS_DOC,
      readerWins: true,
    },
  ];

  readonly configKinds = CURSOR_CONFIG_KINDS;

  /**
   * Cursor config scopes, ordered by documented precedence (project overrides user). Cursor has
   * no personal per-project hook file, so only Project and User are offered.
   */
  configScopes(kinds: ConfigKind[], projectDir: string): ConfigScopeInfo[] {
    return configScopesFrom(this.configKinds, CURSOR_CONFIG_SCOPES, kinds, projectDir);
  }

  // ── Config scaffold (hook only; MCP comes in a later phase) ────────────────

  /**
   * Produce the merge op for a hook artifact targeting Cursor: `.cursor/hooks.json` (project) or
   * `~/.cursor/hooks.json` (user). The install scope is resolved in order:
   * options.scope → fm.defaultScope → 'project'.
   */
  async scaffoldConfig(
    artifactId: string,
    catalog: ResolvedCatalog,
    options: ScaffoldOptions,
  ): Promise<ConfigMergeOp[]> {
    const artifact = catalog.byId.get(artifactId);
    if (!artifact) throw new Error(`Artifact '${artifactId}' not found in the catalog`);
    if (!this.configKinds[artifact.kind as ConfigKind]) {
      throw new Error(
        `Cursor scaffoldConfig only supports the 'hook' kind, got '${artifact.kind}'`,
      );
    }
    return scaffoldConfigFrom(this.configKinds, artifact, options, 'Cursor');
  }

  /**
   * A config artifact Cursor cannot render is skipped with this reason, not an error: a hook whose
   * event or matcher has no Cursor equivalent would match nothing.
   */
  configSkipReason(artifact: Artifact): string | undefined {
    return configSkipReasonFrom(CURSOR_CONFIG_KINDS, artifact);
  }

  /** Every artifact with a scaffold spec (skills, and rules as `.mdc`), and no AGENTS.md. */
  async compile(catalog: ResolvedCatalog, _options: CompileOptions): Promise<FileMap> {
    const files: FileMap = {};
    const ctx = { catalog, installSet: new Set(catalog.artifacts.map(a => a.id)) };
    for (const artifact of catalog.artifacts) {
      const spec = specFor(this.emitSpecs, artifact.kind, 'scaffold');
      if (spec) emitFile(spec, artifact, ctx, files);
    }
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
