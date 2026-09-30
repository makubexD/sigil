/**
 * `sigil patch` command — business logic.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 * `cli.ts` keeps only the option declarations and wires `.action(runPatch)`.
 *
 * Alias: `sigil edit` (title/description/tags subset) and `sigil retarget`
 * (platforms subset) both delegate here via the same option flags.
 *
 * @module
 */

import fs from 'node:fs';
import { loadCatalog } from '../load';
import { getAllTargets } from '../targets';
import { checkSourceArtifact } from '../authoring/check-source';
import { writeArtifactFrontmatter } from '../authoring/frontmatter';
import { addPlatforms, removePlatforms, setPlatforms } from '../authoring/platforms';
import { buildFieldPatch, getEditableFields } from '../authoring/update';
import type { UpdateOps } from '../authoring/update';
import { resolveDefault, requireValidCatalog } from '../cli-helpers';
import { SigilError } from '../errors';
import { requireArtifact } from './shared/artifact';
import type { Artifact, Target } from '../types';
import { buildUpdateOpsFromFlags } from './patch-ops';
import type { PatchOpts } from './patch-ops';

export type { PatchOpts };

interface PlatformOpsResult {
  platformPatch: Record<string, unknown>;
  platformChanged: boolean;
}

interface PlatformMutationResult {
  platforms: string[] | undefined;
  noOp: boolean;
  errors: string[];
  warnings: string[];
}

/** Splits a comma-separated platform list flag value into trimmed, non-empty names. */
function splitPlatformList(s: string): string[] {
  return s
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);
}

/** Dispatches to setPlatforms/addPlatforms/removePlatforms per which flag was passed. */
function computePlatformMutation(
  artifact: Artifact,
  opts: PatchOpts,
  targets: Target[],
): PlatformMutationResult {
  const currentPlatforms = artifact.frontmatter.platforms as string[] | undefined;

  if (opts.toPlatforms) {
    const toVal = opts.toPlatforms === 'all' ? undefined : splitPlatformList(opts.toPlatforms);
    return setPlatforms(artifact.kind, toVal, targets);
  }

  const useAdd = !!opts.addPlatform;
  const delta = splitPlatformList((useAdd ? opts.addPlatform : opts.removePlatform)!);
  return useAdd
    ? addPlatforms(artifact.kind, currentPlatforms, delta, targets)
    : removePlatforms(artifact.kind, currentPlatforms, delta, targets);
}

/** Applies --add-platform / --remove-platform / --to-platforms (delegates to platforms.ts set-math). */
/** Prints mutation warnings/errors, accumulates errors, and builds the platform patch. */
function buildPlatformPatchFromMutation(
  mutResult: PlatformMutationResult,
  errors: string[],
): PlatformOpsResult {
  const platformPatch: Record<string, unknown> = {};
  let platformChanged = false;

  for (const w of mutResult.warnings) console.warn(`  ⚠  ${w}`);
  if (mutResult.errors.length > 0) {
    for (const e of mutResult.errors) console.error(`  ✗  ${e}`);
    errors.push(...mutResult.errors);
  } else if (!mutResult.noOp) {
    platformPatch.platforms = mutResult.platforms;
    platformChanged = true;
  }

  return { platformPatch, platformChanged };
}

function applyPlatformOps(
  artifact: Artifact,
  opts: PatchOpts,
  targets: Target[],
  errors: string[],
): PlatformOpsResult {
  if (!opts.addPlatform && !opts.removePlatform && !opts.toPlatforms) {
    return { platformPatch: {}, platformChanged: false };
  }

  const mutResult = computePlatformMutation(artifact, opts, targets);
  return buildPlatformPatchFromMutation(mutResult, errors);
}

/** Prints the no-op message, plus the editable-fields hint when no flags were provided at all. */
function printNoOpMessage(
  id: string,
  artifact: Artifact,
  updateOps: UpdateOps,
  opts: PatchOpts,
): void {
  console.log(`  → No changes to ${id}.`);

  const hasAnyOp = Object.values(updateOps).some(v => v !== undefined);
  if (!hasAnyOp && !opts.addPlatform && !opts.removePlatform && !opts.toPlatforms) {
    const fields = getEditableFields(artifact.kind);
    console.log(
      `\n  Editable fields for '${artifact.kind}': ${fields.map(f => f.field).join(', ')}`,
    );
    console.log('  Platforms: --add-platform, --remove-platform, --to-platforms');
  }
}

/** Splits validation violations into blocking errors vs. non-blocking dep-drift warnings. */
function partitionViolations(violations: { problem: string }[]): {
  blocking: { problem: string }[];
  warnings: { problem: string }[];
} {
  const isDriftNote = (v: { problem: string }): boolean =>
    v.problem.includes('Dependency coverage drift') || v.problem.includes("won't be available");
  return {
    blocking: violations.filter(v => !isDriftNote(v)),
    warnings: violations.filter(isDriftNote),
  };
}

/** Shared context for the post-write validate/rollback helpers below. */
interface PatchWriteCtx {
  opts: PatchOpts;
  targets: Target[];
}

/**
 * Reloads the catalog after a write and validates; rolls back the file (restoring
 * `originalContent`) and throws if any blocking violation is found.
 */
async function validateWriteOrRollback(
  id: string,
  filePath: string,
  originalContent: string,
  ctx: PatchWriteCtx,
): Promise<void> {
  const updatedCatalog = await loadCatalog(ctx.opts.catalogDir);
  const updatedArtifact = updatedCatalog.byId.get(id);
  if (!updatedArtifact) return;

  const violations = checkSourceArtifact(updatedArtifact, updatedCatalog, ctx.targets);
  const { blocking, warnings } = partitionViolations(violations);

  if (blocking.length > 0) {
    fs.writeFileSync(filePath, originalContent, 'utf-8');
    throw new SigilError('Patch rolled back — would break validation:', {
      hint: blocking.map(v => `  ${v.problem}`).join('\n'),
    });
  }

  for (const w of warnings) console.warn(`  ⚠  ${w.problem}`);
}

/** Writes the patch, then reloads + validates; rolls back the file on a blocking violation. */
async function writeAndValidatePatch(
  id: string,
  artifact: Artifact,
  effectivePatch: Record<string, unknown>,
  ctx: PatchWriteCtx,
): Promise<void> {
  if (Object.keys(effectivePatch).length === 0) return;

  const originalContent = fs.readFileSync(artifact.filePath, 'utf-8') as string;
  try {
    writeArtifactFrontmatter(artifact.filePath, effectivePatch);
  } catch (err) {
    throw new SigilError(`Write failed: ${(err as Error).message}`, { cause: err });
  }

  // Post-write validation — reload from disk so Zod sees the new content.
  await validateWriteOrRollback(id, artifact.filePath, originalContent, ctx);

  console.log(`✓ Patched: ${artifact.filePath}`);
  console.log(`  Next: sigil check ${artifact.filePath}`);
}

// ─── Command function ─────────────────────────────────────────────────────────

interface ComputedPatch {
  updateOps: UpdateOps;
  effectivePatch: Record<string, unknown>;
  effectiveNoOp: boolean;
}

/** Builds the field patch + platform patch from CLI flags; throws on any field/platform error. */
function computeEffectivePatch(
  artifact: Artifact,
  opts: PatchOpts,
  targets: Target[],
): ComputedPatch {
  const updateOps = buildUpdateOpsFromFlags(opts);
  const { patch, noOp, errors } = buildFieldPatch(artifact, updateOps);

  const { platformPatch, platformChanged } = applyPlatformOps(artifact, opts, targets, errors);

  if (errors.length > 0) {
    const rest = errors.slice(1).join('\n');
    throw new SigilError(errors[0]!, rest ? { hint: rest } : {});
  }

  return {
    updateOps,
    effectivePatch: { ...patch, ...platformPatch },
    effectiveNoOp: (noOp || Object.keys(patch).length === 0) && !platformChanged,
  };
}

export async function runPatch(id: string, opts: PatchOpts): Promise<void> {
  // resolveDefault is used for the --catalog-dir default; already applied by Commander.
  void resolveDefault; // imported for documentation — default is set in cli.ts option declaration

  const catalog = await requireValidCatalog(opts.catalogDir);
  const targets = getAllTargets();

  const artifact = requireArtifact(
    catalog.byId,
    catalog.artifacts.map(a => a.id),
    id,
  );

  const { updateOps, effectivePatch, effectiveNoOp } = computeEffectivePatch(
    artifact,
    opts,
    targets,
  );

  if (effectiveNoOp) {
    printNoOpMessage(id, artifact, updateOps, opts);
    return;
  }

  await writeAndValidatePatch(id, artifact, effectivePatch, { opts, targets });
}
