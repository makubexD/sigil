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

    // extends (rules only)
    const extendsRefs = (artifact.frontmatter.extends as string[] | undefined) ?? [];
    for (const ref of extendsRefs) {
      const target = catalog.byId.get(ref);
      if (!target) {
        errors.push({
          artifactId: artifact.id,
          filePath: artifact.filePath,
          error: `Dangling extends reference: '${ref}' does not exist in the catalog`,
        });
      } else if (target.kind !== 'rule') {
        errors.push({
          artifactId: artifact.id,
          filePath: artifact.filePath,
          error: `Invalid extends: '${ref}' has kind '${target.kind}' — only rules can be extended`,
        });
      }
    }

    // uses.rules
    const uses = artifact.frontmatter.uses as { rules?: string[]; agents?: string[] } | undefined;
    for (const ref of uses?.rules ?? []) {
      const target = catalog.byId.get(ref);
      if (!target) {
        errors.push({
          artifactId: artifact.id,
          filePath: artifact.filePath,
          error: `Dangling uses.rules reference: '${ref}' does not exist in the catalog`,
        });
      } else if (target.kind !== 'rule') {
        errors.push({
          artifactId: artifact.id,
          filePath: artifact.filePath,
          error: `Invalid uses.rules: '${ref}' has kind '${target.kind}' — only rules are valid here`,
        });
      }
    }

    // uses.agents
    for (const ref of uses?.agents ?? []) {
      const target = catalog.byId.get(ref);
      if (!target) {
        errors.push({
          artifactId: artifact.id,
          filePath: artifact.filePath,
          error: `Dangling uses.agents reference: '${ref}' does not exist in the catalog`,
        });
      } else if (target.kind !== 'agent') {
        errors.push({
          artifactId: artifact.id,
          filePath: artifact.filePath,
          error: `Invalid uses.agents: '${ref}' has kind '${target.kind}' — only agents are valid here`,
        });
      }
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
            .filter(t => !t.supportedKinds || t.supportedKinds.includes(artifact.kind as ArtifactKind))
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
