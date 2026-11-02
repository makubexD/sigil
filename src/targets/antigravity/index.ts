/**
 * The Antigravity target: Agent Skills in `.agents/skills/<name>/SKILL.md`, the same files the
 * open-standard and Codex targets write, with each skill's rules inlined. Everything here is data
 * on the shared pipeline: emit specs, lexicon, capabilities and citations. It needs nothing
 * outside this folder except its `registerTarget()` line.
 *
 * `build` writes no `AGENTS.md`: an Antigravity repo-wide rule becomes an always-on
 * `.agents/rules/` file, which Antigravity loads, and Antigravity also reads a root `AGENTS.md`,
 * so writing both would load each rule twice. Per-file rules are also tracked by the manifest,
 * and an `AGENTS.md` written by `add` would not be
 * (docs/plan-antigravity-target-b.md Decision 3, probe A1).
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
import type { KindEmitSpec } from '../spec-types';
import { deriveContracts } from '../output-contract';
import { emitFile, scaffoldArtifact, specFor } from '../emit-files';
import { ANTIGRAVITY_CAPABILITIES } from './capabilities';
import { ANTIGRAVITY_LEXICON } from './lexicon';
import { ANTIGRAVITY_EMIT_SPECS } from './spec';
import {
  ANTIGRAVITY_INIT_DIRS,
  ANTIGRAVITY_PROJECT_MARKERS,
  ANTIGRAVITY_VOCABULARY,
} from './metadata';

export class AntigravityTarget implements Target {
  readonly name = 'antigravity';
  readonly displayName = 'Antigravity';
  readonly installHint = 'writes to .agents/';
  readonly afterInstallHint =
    'Antigravity picks up .agents/skills/ and .agents/rules/ in its next session.';

  readonly sharesSkillFilesWith = ['agents-standard', 'codex'];
  readonly capabilities: TargetCapabilities = ANTIGRAVITY_CAPABILITIES;
  readonly initDirs: string[] = ANTIGRAVITY_INIT_DIRS;
  readonly projectMarkers: string[] = ANTIGRAVITY_PROJECT_MARKERS;
  readonly vocabulary: Partial<Record<ArtifactKind, KindVocabulary>> = ANTIGRAVITY_VOCABULARY;
  readonly emitSpecs: readonly KindEmitSpec[] = ANTIGRAVITY_EMIT_SPECS;
  readonly outputContracts: ContractEntry[] = deriveContracts(ANTIGRAVITY_EMIT_SPECS);
  readonly lexicon: ProviderLexicon = ANTIGRAVITY_LEXICON;

  /** Every artifact with a scaffold spec (skills, rules inlined), no AGENTS.md. */
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
