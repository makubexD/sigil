/**
 * Validate phase: schema-checks every artifact and verifies reference-graph integrity.
 * Run this before Resolve so Resolve can assume a clean catalog.
 *
 * Checks:
 *   1. Frontmatter conforms to the zod schema for its kind.
 *   2. Every id in `extends` and `uses.rules`/`uses.agents` exists in the catalog.
 *   3. No cycles in the `extends` graph.
 */
import type { LoadedCatalog, ValidationError, ValidationResult } from './types';
import type { Target, ArtifactKind } from './types';
import { getSchema } from './schema/index';
import { checkReferences, type RefCheck } from './refs';

/** Renders one RefCheck in validate.ts's established per-field wording. */
function formatRefError(check: RefCheck): string {
  if (check.problem === 'dangling') {
    return `Dangling ${check.field} reference: '${check.ref}' does not exist in the catalog`;
  }
  const validityNote =
    check.field === 'extends'
      ? 'only rules can be extended'
      : check.field === 'uses.rules'
        ? 'only rules are valid here'
        : 'only agents are valid here';
  return `Invalid ${check.field}: '${check.ref}' has kind '${check.actualKind}' — ${validityNote}`;
}

export function validateCatalog(catalog: LoadedCatalog, knownTargets?: Target[]): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  for (const artifact of catalog.artifacts) {
    // ── 1. Schema validation ───────────────────────────────────────────────
    let schema;
    try {
      schema = getSchema(artifact.kind);
    } catch {
      errors.push({
        artifactId: artifact.id,
        filePath: artifact.filePath,
        error: `Unknown kind '${artifact.kind}'`,
      });
      continue;
    }

    const result = schema.safeParse(artifact.frontmatter);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const fieldPath = issue.path.length > 0 ? issue.path.join('.') : '(root)';
        errors.push({
          artifactId: artifact.id,
          filePath: artifact.filePath,
          error: `Schema: ${fieldPath} — ${issue.message}`,
        });
      }
    }

    // ── 2. Reference integrity ─────────────────────────────────────────────

    // extends / uses.rules / uses.agents
    for (const check of checkReferences(artifact.frontmatter, catalog)) {
      errors.push({
        artifactId: artifact.id,
        filePath: artifact.filePath,
        error: formatRefError(check),
      });
    }

    // workflow steps
    const steps = artifact.frontmatter.steps as Array<{ ref: string }> | undefined;
    for (const step of steps ?? []) {
      if (!catalog.byId.has(step.ref)) {
        errors.push({
          artifactId: artifact.id,
          filePath: artifact.filePath,
          error: `Dangling workflow step reference: '${step.ref}' does not exist in the catalog`,
        });
      }
    }

    // ── 4. platforms: field validation ─────────────────────────────────────
    if (knownTargets && knownTargets.length > 0) {
      const platforms = artifact.frontmatter.platforms as string[] | undefined;
      if (platforms && platforms.length > 0) {
        const allTargetNames = new Set(knownTargets.map(t => t.name));
        const kindSupporting = new Set(
          knownTargets
            .filter(
              t => !t.supportedKinds || t.supportedKinds.includes(artifact.kind as ArtifactKind),
            )
            .map(t => t.name),
        );
        for (const p of platforms) {
          if (!allTargetNames.has(p)) {
            errors.push({
              artifactId: artifact.id,
              filePath: artifact.filePath,
              error: `platforms: '${p}' is not a registered target. Known: ${[...allTargetNames].join(', ')}`,
            });
          } else if (!kindSupporting.has(p)) {
            warnings.push(
              `[${artifact.id}] platforms: '${p}' does not support kind '${artifact.kind}' — this platform will never emit this artifact`,
            );
          }
        }
      }
    }
  }

  // ── 3. Cycle detection in extends ─────────────────────────────────────────
  detectExtendsCycles(catalog, errors);

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * DFS-based cycle detector for the `extends` graph.
 * Adds an error for each cycle found.
 */
function detectExtendsCycles(catalog: LoadedCatalog, errors: ValidationError[]): void {
  // 'white' = unvisited, 'grey' = in current DFS stack, 'black' = done
  const color = new Map<string, 'white' | 'grey' | 'black'>();
  for (const a of catalog.artifacts) color.set(a.id, 'white');

  function visit(id: string, stack: string[]): void {
    const c = color.get(id);
    if (c === 'black') return;
    if (c === 'grey') {
      // Found a cycle — report at the artifact that re-enters the stack
      const artifact = catalog.byId.get(id);
      const cycleStr = [...stack.slice(stack.indexOf(id)), id].join(' → ');
      errors.push({
        artifactId: id,
        filePath: artifact?.filePath ?? '',
        error: `Cycle in extends graph: ${cycleStr}`,
      });
      return;
    }

    color.set(id, 'grey');
    const artifact = catalog.byId.get(id);
    const parents = (artifact?.frontmatter.extends as string[] | undefined) ?? [];
    for (const parentId of parents) {
      visit(parentId, [...stack, id]);
    }
    color.set(id, 'black');
  }

  for (const artifact of catalog.artifacts) {
    if (color.get(artifact.id) === 'white') {
      visit(artifact.id, []);
    }
  }
}
