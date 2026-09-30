/**
 * applyPatchTransactionally — write + validate, roll back on blocking violation.
 *
 * Unlike `edit` (which only warns on violations), `patch` treats blocking violations
 * as errors to ensure the catalog stays consistent after every write.
 */
import fs from 'fs';
import type { Artifact, LoadedCatalog, SourceViolation, Target } from '../../types';
import { writeArtifactFrontmatter } from '../frontmatter';
import { checkSourceArtifact } from '../check-source';

export interface ApplyResult {
  ok: boolean;
  /** Blocking violations — empty on success. */
  errors: string[];
  /** Non-blocking warnings surfaced after a successful write. */
  warnings: SourceViolation[];
}

/** Violation messages that indicate non-breaking dep-drift (surfaced as warnings). */
const WARN_PATTERNS = ['Dependency coverage drift', "won't be available"];

function isWarning(v: SourceViolation): boolean {
  return WARN_PATTERNS.some(p => v.problem.includes(p));
}

/** Parameters for {@link applyPatchTransactionally}. */
export interface ApplyPatchOptions {
  /** Absolute path to the artifact file. */
  filePath: string;
  /** Frontmatter patch from buildFieldPatch. */
  patch: Record<string, unknown>;
  /** All registered targets. */
  targets: Target[];
  /** ID of the artifact being patched. */
  artifactId: string;
  /** Injected loadCatalog — decouples from I/O for testing. */
  loadFn: (
    dir: string,
    file: string,
  ) => {
    catalog: { byId: Map<string, Artifact>; artifacts: Artifact[] };
  };
  /** Catalog root dir — passed to loadFn for post-write validation. */
  catalogDir: string;
}

/** Splits violations into blocking errors vs. non-blocking (dep-drift) warnings. */
function partitionViolations(violations: SourceViolation[]): {
  blocking: SourceViolation[];
  warnings: SourceViolation[];
} {
  return {
    blocking: violations.filter(v => !isWarning(v)),
    warnings: violations.filter(isWarning),
  };
}

/** Rolls back `filePath` to `original` and reports the blocking violations as errors. */
function rollback(filePath: string, original: string, blocking: SourceViolation[]): ApplyResult {
  fs.writeFileSync(filePath, original, 'utf-8');
  return { ok: false, errors: blocking.map(v => v.problem), warnings: [] };
}

/** Re-validates the patched artifact; rolls back the file when a blocking violation is found. */
function revalidateAfterWrite(
  options: ApplyPatchOptions,
  filePath: string,
  original: string,
): ApplyResult {
  const { targets, artifactId, loadFn, catalogDir } = options;
  const updated = loadFn(catalogDir, '');
  const updatedArtifact = updated.catalog.byId.get(artifactId);
  if (!updatedArtifact) return { ok: true, errors: [], warnings: [] };

  const violations = checkSourceArtifact(
    updatedArtifact,
    updated.catalog as LoadedCatalog,
    targets,
  );
  const { blocking, warnings } = partitionViolations(violations);
  if (blocking.length > 0) return rollback(filePath, original, blocking);
  return { ok: true, errors: [], warnings };
}

/**
 * Write a frontmatter patch transactionally.
 *
 * Saves the original file content before writing. If schema/reference validation
 * fails after the write, the original is restored and the blocking errors are returned.
 */
export function applyPatchTransactionally(options: ApplyPatchOptions): ApplyResult {
  const { filePath, patch } = options;
  const original = fs.readFileSync(filePath, 'utf-8');

  try {
    writeArtifactFrontmatter(filePath, patch);
  } catch (err) {
    return { ok: false, errors: [(err as Error).message], warnings: [] };
  }

  try {
    return revalidateAfterWrite(options, filePath, original);
  } catch (err) {
    fs.writeFileSync(filePath, original, 'utf-8');
    return { ok: false, errors: [(err as Error).message], warnings: [] };
  }
}
