/**
 * The open-standard target: Agent Skills in `.agents/skills/<name>/SKILL.md`, which several tools
 * read as-is (GitHub Copilot and Cursor among them; see the skill spec's citations), plus a root
 * `AGENTS.md` with the repo-wide rules on a full build. Everything here is data on the shared
 * pipeline: emit specs, lexicon, capabilities and citations. It needs nothing outside this folder
 * except its `registerTarget()` line.
 *
 * Copilot also reads `.agents/skills/`, so installing the same skills for both `copilot` and this
 * target would show Copilot each skill twice; the install hint says so.
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
import { AGENTS_STANDARD_CAPABILITIES } from './capabilities';
import { AGENTS_STANDARD_LEXICON } from './lexicon';
import { AGENTS_STANDARD_EMIT_SPECS } from './spec';
import {
  AGENTS_STANDARD_AGGREGATE_DOCS,
  AGENTS_STANDARD_INIT_DIRS,
  AGENTS_STANDARD_PROJECT_MARKERS,
  AGENTS_STANDARD_VOCABULARY,
} from './metadata';

export class AgentsStandardTarget implements Target {
  readonly name = 'agents-standard';
  readonly displayName = 'Open standard (Agent Skills)';
  readonly installHint = 'writes to .agents/skills/';
  readonly afterInstallHint =
    'tools that read the open standard pick up .agents/skills/ in their next session. Copilot reads it too: do not also install the same skills with --target copilot.';

  readonly capabilities: TargetCapabilities = AGENTS_STANDARD_CAPABILITIES;
  readonly initDirs: string[] = AGENTS_STANDARD_INIT_DIRS;
  readonly projectMarkers: string[] = AGENTS_STANDARD_PROJECT_MARKERS;
  readonly vocabulary: Partial<Record<ArtifactKind, KindVocabulary>> = AGENTS_STANDARD_VOCABULARY;
  readonly emitSpecs: readonly KindEmitSpec[] = AGENTS_STANDARD_EMIT_SPECS;
  readonly outputContracts: ContractEntry[] = deriveContracts(AGENTS_STANDARD_EMIT_SPECS);
  readonly lexicon: ProviderLexicon = AGENTS_STANDARD_LEXICON;
  readonly aggregateDocs: readonly SourcedDocRef[] = AGENTS_STANDARD_AGGREGATE_DOCS;

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
