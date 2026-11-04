/**
 * The OpenCode target: Agent Skills in the shared `.agents/skills/`, which OpenCode reads as-is,
 * subagents in `.opencode/agents/`, commands in `.opencode/commands/`, and repo-wide rules in the
 * root `AGENTS.md` on a full build. This is the scaffold channel only; MCP and config come later.
 * Everything here is data on the shared pipeline: emit specs, lexicon, capabilities and citations.
 * It needs nothing outside this folder except its `registerTarget()` line.
 *
 * The open-standard target, Codex and Antigravity write the same `.agents/skills/` files, so a
 * project uses one of the four for skills (Target.sharesSkillFilesWith).
 *
 * @module
 */
import type {
  ArtifactKind,
  CompileOptions,
  ContractEntry,
  FileMap,
  KindVocabulary,
  ResolvedCatalog,
  ScaffoldOptions,
  Target,
} from '../../types';
import type { TargetCapabilities } from '../capability-types';
import type { ProviderLexicon } from '../lexicon';
import type { KindEmitSpec, SourcedDocRef } from '../spec-types';
import { deriveContracts } from '../output-contract';
import { emitFile, scaffoldArtifact, specFor } from '../emit-files';
import { isRepoWideRule, renderRulesDocument } from '../shared/repo-wide-rules';
import { OPENCODE_CAPABILITIES } from './capabilities';
import { OPENCODE_LEXICON } from './lexicon';
import { OPENCODE_EMIT_SPECS } from './spec';
import { OPENCODE_AGGREGATE_DOCS } from './aggregate-docs';
import { OPENCODE_SKILLS_DOC } from './doc-refs';
import { OPENCODE_INIT_DIRS, OPENCODE_PROJECT_MARKERS, OPENCODE_VOCABULARY } from './metadata';

export class OpenCodeTarget implements Target {
  readonly name = 'opencode';
  readonly displayName = 'OpenCode';
  readonly installHint = 'writes to .agents/skills/ and .opencode/';
  readonly afterInstallHint =
    'OpenCode picks them up in its next session. Do not also install the same skills with --target agents-standard, codex or antigravity: they write the same .agents/skills/ files.';

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
   * it and which copy it shows on a name clash isn't fixed (OPENCODE_SKILLS_DOC).
   */
  readonly alsoLoads = [
    {
      kind: 'skill' as const,
      targets: ['claude'],
      doc: OPENCODE_SKILLS_DOC,
      unfixedWinner: true,
    },
  ];

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
