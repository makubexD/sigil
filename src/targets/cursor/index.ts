/**
 * The Cursor target: Agent Skills in `.cursor/skills/<name>/SKILL.md` (each skill's rules inlined
 * into it) and project rules as `.mdc` files in `.cursor/rules/`. Everything here is data on the
 * shared pipeline: emit specs, lexicon, capabilities and citations. It needs nothing outside this
 * folder except its `registerTarget()` line.
 *
 * `build` writes no `AGENTS.md`: Cursor's native repo-wide rules become `.mdc` files in
 * `.cursor/rules/`, and Cursor also reads a root `AGENTS.md`, so writing both would load each
 * rule twice (see docs/plan-cursor-target-b.md).
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
import { CURSOR_CAPABILITIES } from './capabilities';
import { CURSOR_LEXICON } from './lexicon';
import { CURSOR_EMIT_SPECS } from './spec';
import { CURSOR_INIT_DIRS, CURSOR_PROJECT_MARKERS, CURSOR_VOCABULARY } from './metadata';

export class CursorTarget implements Target {
  readonly name = 'cursor';
  readonly displayName = 'Cursor';
  readonly installHint = 'writes to .cursor/';
  readonly afterInstallHint =
    'Cursor picks up .cursor/skills/ and .cursor/rules/ in its next chat.';

  readonly capabilities: TargetCapabilities = CURSOR_CAPABILITIES;
  readonly initDirs: string[] = CURSOR_INIT_DIRS;
  readonly projectMarkers: string[] = CURSOR_PROJECT_MARKERS;
  readonly vocabulary: Partial<Record<ArtifactKind, KindVocabulary>> = CURSOR_VOCABULARY;
  readonly emitSpecs: readonly KindEmitSpec[] = CURSOR_EMIT_SPECS;
  readonly outputContracts: ContractEntry[] = deriveContracts(CURSOR_EMIT_SPECS);
  readonly lexicon: ProviderLexicon = CURSOR_LEXICON;

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
