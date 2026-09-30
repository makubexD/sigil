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

/**
 * Write a frontmatter patch transactionally.
 *
 * Saves the original file content before writing. If schema/reference validation
 * fails after the write, the original is restored and the blocking errors are returned.
 *
 * @param filePath    Absolute path to the artifact file.
 * @param patch       Frontmatter patch from buildFieldPatch.
 * @param targets     All registered targets.
 * @param artifactId  ID of the artifact being patched.
 * @param loadFn      Injected loadCatalog — decouples from I/O for testing.
 * @param catalogDir  Catalog root dir — passed to loadFn for post-write validation.
 */
export function applyPatchTransactionally(
  filePath: string,
  patch: Record<string, unknown>,
  targets: Target[],
  artifactId: string,
  loadFn: (
    dir: string,
    file: string,
  ) => {
    catalog: { byId: Map<string, Artifact>; artifacts: Artifact[] };
  },
  catalogDir: string,
): ApplyResult {
  const original = fs.readFileSync(filePath, 'utf-8');

  try {
    writeArtifactFrontmatter(filePath, patch);
  } catch (err) {
    return { ok: false, errors: [(err as Error).message], warnings: [] };
  }

  try {
    const updated = loadFn(catalogDir, '');
    const updatedArtifact = updated.catalog.byId.get(artifactId);

    if (updatedArtifact) {
      const violations = checkSourceArtifact(
        updatedArtifact,
        updated.catalog as LoadedCatalog,
        targets,
      );

      const blocking = violations.filter(v => !isWarning(v));
      const warnings = violations.filter(isWarning);

      if (blocking.length > 0) {
        fs.writeFileSync(filePath, original, 'utf-8');
        return { ok: false, errors: blocking.map(v => v.problem), warnings: [] };
      }

      return { ok: true, errors: [], warnings };
    }
  } catch (err) {
    fs.writeFileSync(filePath, original, 'utf-8');
    return { ok: false, errors: [(err as Error).message], warnings: [] };
  }

  return { ok: true, errors: [], warnings: [] };
}
