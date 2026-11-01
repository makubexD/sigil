/**
 * The Codex target: Agent Skills in `.agents/skills/<name>/SKILL.md`, the open-standard layout
 * Codex loads, plus a root `AGENTS.md` with the repo-wide rules on a full build. Everything here
 * is data on the shared pipeline: emit specs, lexicon, capabilities and citations. It needs
 * nothing outside this folder except its `registerTarget()` line.
 *
 * The agents-standard target writes the same `.agents/skills/` files. The two render them
 * identically, so one tool loads each skill once and either install can be removed on its own.
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
import { CODEX_CAPABILITIES } from './capabilities';
import { CODEX_LEXICON } from './lexicon';
import { CODEX_EMIT_SPECS } from './spec';
import {
  CODEX_AGGREGATE_DOCS,
  CODEX_INIT_DIRS,
  CODEX_PROJECT_MARKERS,
  CODEX_VOCABULARY,
} from './metadata';

export class CodexTarget implements Target {
  readonly name = 'codex';
  readonly displayName = 'OpenAI Codex';
  readonly installHint = 'writes to .agents/skills/';
  readonly afterInstallHint =
    'Codex picks up .agents/skills/ in its next session. Run it in a trusted project: an untrusted one skips AGENTS.md and .codex/ config.';

  readonly capabilities: TargetCapabilities = CODEX_CAPABILITIES;
  readonly initDirs: string[] = CODEX_INIT_DIRS;
  readonly projectMarkers: string[] = CODEX_PROJECT_MARKERS;
  readonly vocabulary: Partial<Record<ArtifactKind, KindVocabulary>> = CODEX_VOCABULARY;
  readonly emitSpecs: readonly KindEmitSpec[] = CODEX_EMIT_SPECS;
  readonly outputContracts: ContractEntry[] = deriveContracts(CODEX_EMIT_SPECS);
  readonly lexicon: ProviderLexicon = CODEX_LEXICON;
  readonly aggregateDocs: readonly SourcedDocRef[] = CODEX_AGGREGATE_DOCS;

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
