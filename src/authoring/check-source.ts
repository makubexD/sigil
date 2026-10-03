/**
 * Source-side artifact validator.
 *
 * The mirror of src/targets/output-contract.ts: while that module checks emitted
 * file shapes (post-compile), this module checks source `.md` files against:
 *   1. The zod schema for the artifact's kind (the single source of truth).
 *   2. Source-convention rules: id↔path↔language consistency, kebab-case names,
 *      duplicate-id detection, valid cross-references.
 *   3. Platform sanity: `platforms:` lists only real, kind-supporting targets.
 *   4. Dependency coverage drift: a skill targeting platform P must not reference
 *      deps (rules/agents) restricted to a platform P does not include.
 *
 * Used by:
 *   - `sigil check <file>`  — explicit single-file validation
 *   - `sigil new`           — auto-run after scaffolding
 *   - `sigil retarget`      — validate the mutated artifact before saving
 */
import type { Artifact, LoadedCatalog, SourceViolation } from '../types';
import { getSchema } from '../schema/index';
import type { Target } from '../types';
import type { CheckCtx } from './check-source-ctx';
import { supportsKind } from '../targets/capabilities';
import {
  checkIdConsistency,
  checkNamespace,
  checkKindMatchesPath,
  checkDuplicateId,
  checkReferenceIntegrity,
} from './check-source-conventions';

/**
 * §4b: argumentHint must not carry embedded quote characters. gray-matter parses
 * YAML, so a value like `argumentHint: "\"foo\""` is not a typo caught elsewhere —
 * it round-trips to the string `"foo"` (quotes included) and gets double-quoted
 * again by every adapter's yamlScalar()/serializeScalar(), producing visibly
 * broken frontmatter in the emitted SKILL.md/prompt file.
 */
function checkArgumentHint(ctx: CheckCtx): void {
  const { artifact, v } = ctx;
  const argumentHint = artifact.frontmatter.argumentHint as string | undefined;
  if (argumentHint && (argumentHint.startsWith('"') || argumentHint.endsWith('"'))) {
    v.push({
      file: artifact.filePath,
      problem: `argumentHint '${argumentHint}' contains embedded quote characters — author it as a plain string (e.g. '<package> [version]'), not a quoted string within the YAML value`,
    });
  }
}

/** One dependency-coverage-drift check for a single `uses.rules`/`uses.agents` ref list. */
/** One dep's coverage-drift check; pushes a violation to `v` when the dep is under-covered. */
function checkOneDepDrift(
  ctx: CheckCtx,
  ref: string,
  refKind: 'rule' | 'agent',
  platforms: string[],
): void {
  const dep = ctx.catalog.byId.get(ref);
  if (!dep) return; // already reported by checkReferenceIntegrity
  const depPlatforms = dep.frontmatter.platforms as string[] | undefined;
  if (!depPlatforms || depPlatforms.length === 0) return; // dep is universal — fine
  const missingForDep = platforms.filter(p => !depPlatforms.includes(p));
  if (missingForDep.length === 0) return;
  ctx.v.push({
    file: ctx.artifact.filePath,
    problem: `Dependency coverage drift: ${refKind} '${ref}' is restricted to [${depPlatforms.join(', ')}] but this skill targets [${platforms.join(', ')}] — '${ref}' won't be available on: ${missingForDep.join(', ')}`,
  });
}

function checkDependencyDrift(
  ctx: CheckCtx,
  refs: string[],
  refKind: 'rule' | 'agent',
  platforms: string[],
): void {
  for (const ref of refs) {
    checkOneDepDrift(ctx, ref, refKind, platforms);
  }
}

/** §5: each `platforms:` entry must be a registered target that supports this artifact's kind. */
function checkPlatformNames(ctx: CheckCtx, platforms: string[]): void {
  const { artifact, targets, v } = ctx;
  const file = artifact.filePath;
  const allTargetNames = new Set(targets.map(t => t.name));
  const kindSupporting = new Set(
    targets.filter(t => supportsKind(t, artifact.kind)).map(t => t.name),
  );

  for (const p of platforms) {
    if (!allTargetNames.has(p)) {
      v.push({
        file,
        problem: `platforms: '${p}' is not a registered target. Known targets: ${[...allTargetNames].join(', ')}`,
      });
    } else if (!kindSupporting.has(p)) {
      v.push({ file, problem: `platforms: '${p}' does not support kind '${artifact.kind}'` });
    }
  }
}

/** §5+6: `platforms:` validation and dependency-coverage-drift warnings. */
function checkPlatforms(ctx: CheckCtx): void {
  const platforms = ctx.artifact.frontmatter.platforms as string[] | undefined;
  if (!platforms || platforms.length === 0) return;

  checkPlatformNames(ctx, platforms);

  const uses = ctx.artifact.frontmatter.uses as { rules?: string[]; agents?: string[] } | undefined;
  checkDependencyDrift(ctx, uses?.rules ?? [], 'rule', platforms);
  checkDependencyDrift(ctx, uses?.agents ?? [], 'agent', platforms);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface CheckSourceOptions {
  /** When true, only run schema validation (skip path/id/language/reference checks). */
  schemaOnly?: boolean;
}

/** Runs the zod schema check for the artifact's kind, pushing any issues to `v`. */
function checkSchema(artifact: Artifact, v: SourceViolation[]): { unknownKind: boolean } {
  let schema;
  try {
    schema = getSchema(artifact.kind);
  } catch {
    v.push({ file: artifact.filePath, problem: `Unknown kind '${artifact.kind}'` });
    return { unknownKind: true };
  }

  const parseResult = schema.safeParse(artifact.frontmatter);
  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      const fieldPath = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      v.push({ file: artifact.filePath, problem: `Schema: ${fieldPath} — ${issue.message}` });
    }
  }
  return { unknownKind: false };
}

/**
 * Check a single artifact against schema + source conventions.
 *
 * @param artifact   A loaded artifact (from loadCatalog or hand-constructed for a new file).
 * @param catalog    The full loaded catalog (needed for duplicate-id and reference checks).
 * @param targets    All registered targets (needed for `platforms:` validation).
 * @param opts       Optional strictness overrides.
 * @returns          Array of violations; empty = clean.
 */
export function checkSourceArtifact(
  artifact: Artifact,
  catalog: LoadedCatalog,
  targets: Target[],
  opts: CheckSourceOptions = {},
): SourceViolation[] {
  const v: SourceViolation[] = [];

  const { unknownKind } = checkSchema(artifact, v);
  if (unknownKind) return v; // can't do any further checks
  if (opts.schemaOnly) return v;

  const ctx: CheckCtx = { artifact, catalog, targets, v };
  checkIdConsistency(ctx);
  checkNamespace(ctx);
  checkKindMatchesPath(ctx);
  checkDuplicateId(ctx);
  checkReferenceIntegrity(ctx);
  checkArgumentHint(ctx);
  checkPlatforms(ctx);

  return v;
}
