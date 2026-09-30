/**
 * Shared context type threaded through every per-artifact and catalog-wide checker in
 * src/validate/. Split out so every check module can import it without importing the
 * orchestrator (index.ts), which would create a cycle.
 */
import type { LoadedCatalog, ValidationError, Target } from '../types';

/** Shared context threaded through every per-artifact checker below. */
export interface ValidateCtx {
  readonly catalog: LoadedCatalog;
  readonly knownTargets: Target[] | undefined;
  readonly errors: ValidationError[];
  readonly warnings: string[];
}
