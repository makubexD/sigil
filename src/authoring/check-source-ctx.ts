/**
 * CheckCtx — the shared context threaded through check-source.ts's section checkers.
 * Split into its own file so check-source-conventions.ts can depend on the type
 * without importing from check-source.ts (would create a cycle).
 *
 * @module
 */
import type { Artifact, LoadedCatalog, SourceViolation, Target } from '../types';

/**
 * Shared context threaded through every section checker below — bundles the
 * artifact, catalog, targets, and the shared mutable violations array into one
 * object, so a checker needing a fifth thing never means adding another
 * positional parameter (mirrors the `PatchCtx` pattern in authoring/update).
 */
export interface CheckCtx {
  readonly artifact: Artifact;
  readonly catalog: LoadedCatalog;
  readonly targets: Target[];
  readonly v: SourceViolation[];
}
