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

export interface RetargetOptions {
  add?: string | undefined;
  remove?: string | undefined;
  to?: string | undefined;
  catalogDir: string;
  yes: boolean;
  withDeps: boolean;
}

export async function runRetarget(id: string, opts: RetargetOptions): Promise<void> {
  if (!opts.add && !opts.remove && !opts.to) {
    console.error('✗ Specify at least one of: --add, --remove, --to');
    process.exit(1);
  }
  if ((opts.add ? 1 : 0) + (opts.remove ? 1 : 0) + (opts.to ? 1 : 0) > 1) {
    console.error('✗ Use only one of --add, --remove, or --to per invocation.');
    process.exit(1);
  }

  const catalog = await loadCatalog(opts.catalogDir);
  const targets = getAllTargets();

  const artifact = catalog.byId.get(id);
  if (!artifact) {
    const available = catalog.artifacts.map(a => a.id).join(', ');
    console.error(`✗ Artifact '${id}' not found. Available: ${available || '(none)'}`);
    process.exit(1);
  }

  const kind = artifact.kind;
  const currentPlatforms = artifact.frontmatter.platforms as string[] | undefined;
  let mutResult: {
    platforms: string[] | undefined;
    noOp: boolean;
    errors: string[];
    warnings: string[];
  };

  if (opts.to) {
    const toVal =
      opts.to === 'all'
        ? undefined
        : opts.to
            .split(',')
            .map(p => p.trim())
            .filter(Boolean);
    mutResult = setPlatforms(kind, toVal, targets);
  } else if (opts.add) {
    const toAdd = opts.add
      .split(',')
      .map(p => p.trim())
      .filter(Boolean);
    mutResult = addPlatforms(kind, currentPlatforms, toAdd, targets);
  } else {
    const toRemove = opts
      .remove!.split(',')
      .map(p => p.trim())
      .filter(Boolean);
    mutResult = removePlatforms(kind, currentPlatforms, toRemove, targets);
  }

  // Print warnings
  for (const w of mutResult.warnings) console.warn(`  ⚠  ${w}`);

  // Fail on errors
  if (mutResult.errors.length > 0) {
    for (const e of mutResult.errors) console.error(`  ✗  ${e}`);
    process.exit(1);
  }

  if (mutResult.noOp) {
    console.log(`  → No change to ${id} (already at the requested state).`);
    return;
  }

  // Write updated platforms field back to the source file (body preserved verbatim)
  writeArtifactFrontmatter(artifact.filePath, { platforms: mutResult.platforms });

  const newLabel =
    mutResult.platforms === undefined
      ? 'all supporting AIs (DRY default — platforms: field removed)'
      : `[${mutResult.platforms.join(', ')}]`;
  console.log(`✓ ${id}: platforms updated → ${newLabel}`);
  console.log(`  File: ${artifact.filePath}`);

  // Validate the changed artifact
  const updatedCatalog = await loadCatalog(opts.catalogDir);
  const updatedArtifact = updatedCatalog.byId.get(id);
  if (updatedArtifact) {
    const violations = checkSourceArtifact(updatedArtifact, updatedCatalog, targets);
    if (violations.length > 0) {
      console.warn('  ⚠  Post-retarget validation warnings:');
      for (const viol of violations) console.warn(`     ${viol.problem}`);
    }
  }

  if (mutResult.platforms === undefined) {
    console.log(`\n  → Next: sigil build  (will now emit to all supporting platforms)`);
  } else {
    console.log(`\n  → Next: sigil build  (or: sigil retarget ${id} --to all to widen back)`);
  }

  console.log(
    "  ℹ  Consumers who already ran 'add' must re-run it to pick up the changed targeting.",
  );
}
