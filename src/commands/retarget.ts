/**
 * `sigil retarget <id>` command — change the platform targeting of a catalog artifact.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 *
 * @module
 */
import { loadCatalog } from '../load';
import { getAllTargets } from '../targets';
import { addPlatforms, removePlatforms, setPlatforms } from '../authoring/platforms';
import { writeArtifactFrontmatter } from '../authoring/frontmatter';
import { checkSourceArtifact } from '../authoring/check-source';
import { SigilError } from '../errors';
import { requireArtifact } from './shared/artifact';
import { requireValidCatalog } from '../cli-helpers';
import type { Target } from '../types';

export interface RetargetOptions {
  add?: string | undefined;
  remove?: string | undefined;
  to?: string | undefined;
  catalogDir: string;
  yes: boolean;
  withDeps: boolean;
}

interface PlatformMutationResult {
  platforms: string[] | undefined;
  noOp: boolean;
  errors: string[];
  warnings: string[];
}

/** Throws unless exactly one of --add/--remove/--to was specified. */
function validateRetargetFlags(opts: RetargetOptions): void {
  if (!opts.add && !opts.remove && !opts.to) {
    throw new SigilError('Specify at least one of: --add, --remove, --to');
  }
  if ((opts.add ? 1 : 0) + (opts.remove ? 1 : 0) + (opts.to ? 1 : 0) > 1) {
    throw new SigilError('Use only one of --add, --remove, or --to per invocation.');
  }
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
  kind: string,
  currentPlatforms: string[] | undefined,
  opts: RetargetOptions,
  targets: Target[],
): PlatformMutationResult {
  if (opts.to) {
    const toVal = opts.to === 'all' ? undefined : splitPlatformList(opts.to);
    return setPlatforms(kind, toVal, targets);
  }
  if (opts.add) {
    return addPlatforms(kind, currentPlatforms, splitPlatformList(opts.add), targets);
  }
  return removePlatforms(kind, currentPlatforms, splitPlatformList(opts.remove!), targets);
}

/** Reloads the catalog and prints any post-retarget validation warnings. */
async function validateAfterRetarget(
  catalogDir: string,
  id: string,
  targets: Target[],
): Promise<void> {
  const updatedCatalog = await loadCatalog(catalogDir);
  const updatedArtifact = updatedCatalog.byId.get(id);
  if (updatedArtifact) {
    const violations = checkSourceArtifact(updatedArtifact, updatedCatalog, targets);
    if (violations.length > 0) {
      console.warn('  ⚠  Post-retarget validation warnings:');
      for (const viol of violations) console.warn(`     ${viol.problem}`);
    }
  }
}

/** Prints the `✓ ... platforms updated` success line + file path. */
function printRetargetSuccess(
  id: string,
  artifact: { filePath: string },
  mutResult: PlatformMutationResult,
): void {
  const newLabel =
    mutResult.platforms === undefined
      ? 'all supporting AIs (DRY default — platforms: field removed)'
      : `[${mutResult.platforms.join(', ')}]`;
  console.log(`✓ ${id}: platforms updated → ${newLabel}`);
  console.log(`  File: ${artifact.filePath}`);
}

/** Prints the "Next:" hint + consumer re-run reminder. */
function printRetargetNextSteps(id: string, mutResult: PlatformMutationResult): void {
  if (mutResult.platforms === undefined) {
    console.log(`\n  → Next: sigil build  (will now emit to all supporting platforms)`);
  } else {
    console.log(`\n  → Next: sigil build  (or: sigil retarget ${id} --to all to widen back)`);
  }

  console.log(
    "  ℹ  Consumers who already ran 'add' must re-run it to pick up the changed targeting.",
  );
}

/** Prints warnings, then throws if the mutation produced any errors. */
function reportMutationWarningsAndErrors(mutResult: PlatformMutationResult): void {
  for (const w of mutResult.warnings) console.warn(`  ⚠  ${w}`);
  if (mutResult.errors.length > 0) {
    const rest = mutResult.errors.slice(1).join('\n');
    throw new SigilError(mutResult.errors[0]!, rest ? { hint: rest } : {});
  }
}

export async function runRetarget(id: string, opts: RetargetOptions): Promise<void> {
  validateRetargetFlags(opts);

  const catalog = await requireValidCatalog(opts.catalogDir);
  const targets = getAllTargets();

  const allIds = catalog.artifacts.map(a => a.id);
  const artifact = requireArtifact(catalog.byId, allIds, id);

  const currentPlatforms = artifact.frontmatter.platforms as string[] | undefined;
  const mutResult = computePlatformMutation(artifact.kind, currentPlatforms, opts, targets);
  reportMutationWarningsAndErrors(mutResult);
  if (mutResult.noOp) {
    console.log(`  → No change to ${id} (already at the requested state).`);
    return;
  }

  // Write updated platforms field back to the source file (body preserved verbatim)
  writeArtifactFrontmatter(artifact.filePath, { platforms: mutResult.platforms });

  printRetargetSuccess(id, artifact, mutResult);
  await validateAfterRetarget(opts.catalogDir, id, targets);
  printRetargetNextSteps(id, mutResult);
}
