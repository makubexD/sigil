/**
 * The one writer for whole-file kinds (skill, agent, rule, prompt, workflow) on every target and
 * channel. A file's path comes only from its spec's `outputPath`, and its content only from
 * `renderArtifact`; a skill's reference files land beside it under `references/`, through the same
 * lexicon (`renderReference`). Targets keep only what is truly theirs: which artifacts go where (a
 * plugin's pack, Copilot's repo-wide rules) and their aggregate files (AGENTS.md, plugin.json).
 * The FileMap is written to disk by
 * `writeFilesSync` / `partitionFiles`, which contain every path (`resolveContained`).
 *
 * @module
 */
import path from 'path';
import type {
  ArtifactKind,
  FileMap,
  ResolvedArtifact,
  ResolvedCatalog,
  ScaffoldOptions,
} from '../types';
import { SigilError } from '../errors';
import type { EmitContext, KindEmitSpec } from './spec-types';
import { assertRestrictionCarried, renderArtifact, renderReference, REFERENCES_DIR } from './emit';
import { inlinesDependency } from './capabilities';
import { specSkipReason } from './tool-restriction';

/** The delivery channel a spec serves: `add` / `init` (scaffold) or a built plugin. */
export type EmitChannel = 'scaffold' | 'plugin';

/** The spec in `specs` that renders `kind` on `channel`, or undefined when there is none. */
export function specFor(
  specs: readonly KindEmitSpec[],
  kind: ArtifactKind,
  channel: EmitChannel,
): KindEmitSpec | undefined {
  return specs.find(s => s.kind === kind && (s.variant === undefined || s.variant === channel));
}

/** Renders `artifact` through `spec` into `files` at the spec's path, with its references. */
export function emitFile(
  spec: KindEmitSpec,
  artifact: ResolvedArtifact,
  ctx: EmitContext,
  files: FileMap,
): void {
  // An artifact this spec cannot use as written — a strict agent whose tool restriction the
  // dialect cannot carry, or whatever the spec's own `skipReason` refuses — is left out instead of
  // written wide: `add`'s selection reports it as skipped, `build` simply omits it. renderArtifact
  // and scaffoldArtifact keep throwing on a direct call as a backstop.
  if (specSkipReason(spec, artifact) !== undefined) return;
  const filePath = spec.outputPath(artifact, ctx);
  files[filePath] = renderArtifact(spec, artifact, ctx);
  const dir = path.posix.dirname(filePath);
  for (const ref of artifact.references ?? []) {
    files[path.posix.join(dir, REFERENCES_DIR, ref.name)] = renderReference(spec, ref.content);
  }
}

/** Inputs for {@link scaffoldArtifact}. */
export interface ScaffoldInput {
  readonly specs: readonly KindEmitSpec[];
  readonly artifact: ResolvedArtifact;
  readonly catalog: ResolvedCatalog;
  readonly options: ScaffoldOptions;
}

/**
 * Dependencies of `artifact` this target writes as their own files: it has a spec for the kind,
 * the skill's spec does not inline that kind, and the spec can carry the dependency (a strict
 * agent the dialect cannot express is left out, so the skill still installs — no throw).
 */
function installableDeps(
  specs: readonly KindEmitSpec[],
  spec: KindEmitSpec,
  artifact: ResolvedArtifact,
  catalog: ResolvedCatalog,
): ResolvedArtifact[] {
  const deps = [
    ...(artifact.resolvedRules ?? []),
    ...(artifact.resolvedAgentIds ?? []).flatMap(id => catalog.byId.get(id) ?? []),
  ];
  return deps.filter(dep => {
    const depSpec = specFor(specs, dep.kind, 'scaffold');
    return (
      depSpec !== undefined &&
      !inlinesDependency(spec, dep.kind) &&
      specSkipReason(depSpec, dep) === undefined
    );
  });
}

/**
 * The files `add` writes for one artifact: the artifact itself and, for a skill (unless
 * `--no-deps`), the rules and agents it uses. Throws for a kind the target has no scaffold spec
 * for; `resolveSelection` skips unsupported kinds before this is reached.
 */
export function scaffoldArtifact(input: ScaffoldInput, files: FileMap = {}): FileMap {
  const { specs, artifact, catalog, options } = input;
  const spec = specFor(specs, artifact.kind, 'scaffold');
  if (!spec) throw new Error(`Scaffolding not supported for kind '${artifact.kind}'`);
  // A top-level pick still fails closed here (update/status), unlike a dependency or a build.
  assertRestrictionCarried(spec, artifact);
  const skipReason = spec.skipReason?.(artifact.frontmatter);
  if (skipReason) throw new SigilError(`${artifact.id}: ${skipReason}`);
  emitFile(spec, artifact, { catalog, installSet: options.coInstallSet }, files);
  if (options.includeDeps === false) return files;
  const depOptions = { ...options, includeDeps: false };
  for (const dep of installableDeps(specs, spec, artifact, catalog)) {
    scaffoldArtifact({ ...input, artifact: dep, options: depOptions }, files);
  }
  return files;
}
