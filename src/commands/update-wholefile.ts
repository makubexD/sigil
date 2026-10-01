/**
 * Whole-file entry re-scaffold/partition/write logic for `sigil update`.
 * Split out of update.ts to keep that file under the repo's own module-size threshold.
 * Stale-path (emit-path migration) handling lives in update-stale.ts — same reason.
 *
 * @module
 */
import path from 'node:path';
import { writeFilesSync } from '../cli-helpers';
import { sha256 } from '../manifest';
import { currentTemplateOfId } from '../manifest/template-of';
import { stalePaths, applyStaleMigration, rebuildEntryFiles, isFileDrifted } from './update-stale';
import type { ManifestEntry } from '../manifest/types';
import type { ResolvedCatalog, Target } from '../types';
import type { UpdateOptions } from './update';

export { isFileDrifted } from './update-stale';

export interface WholeFileUpdateResult {
  updated: boolean;
  /** Set by a preview (`--dry-run`): this entry would change. A preview never sets `updated`. */
  pending?: boolean;
  skippedDriftCount: number;
}

interface PartitionedFreshFiles {
  toWrite: Record<string, string>;
  skipped: string[];
  skippedDriftCount: number;
}

/** Scaffolds fresh content for a whole-file entry, or undefined (already logged) on failure. */
async function scaffoldFreshFiles(
  entry: ManifestEntry,
  resolved: ResolvedCatalog,
  target: Target,
  opts: UpdateOptions,
): Promise<Record<string, string> | undefined> {
  try {
    return await target.scaffold!(entry.id, resolved, {
      projectDir: opts.projectDir,
      overwrite: true,
      includeDeps: false,
      ...(opts.installedIds ? { coInstallSet: new Set(opts.installedIds) } : {}),
    });
  } catch (err) {
    console.error(`  ✗  ${entry.id}: scaffold failed — ${(err as Error).message}`);
    return undefined;
  }
}

/** Splits fresh scaffold output into files to write vs. drifted files to skip (without --force). */
type FreshFileVerdict = 'unchanged' | 'skip-drifted' | 'write';

/** Classifies one fresh-scaffold file: unchanged, drifted-and-skipped, or needs writing. */
function classifyFreshFile(
  relPath: string,
  content: string,
  recordedHash: string | undefined,
  opts: UpdateOptions,
): FreshFileVerdict {
  if (recordedHash && sha256(content) === recordedHash) return 'unchanged';

  const fullPath = path.join(opts.projectDir, relPath);
  if (isFileDrifted(fullPath, recordedHash) && !opts.force) return 'skip-drifted';

  return 'write';
}

function partitionFreshFiles(
  entry: ManifestEntry,
  freshFiles: Record<string, string>,
  opts: UpdateOptions,
): PartitionedFreshFiles {
  const recordedByPath = new Map(entry.files.map(f => [f.path, f.sha256]));
  const result: PartitionedFreshFiles = { toWrite: {}, skipped: [], skippedDriftCount: 0 };
  for (const [relPath, content] of Object.entries(freshFiles)) {
    const verdict = classifyFreshFile(relPath, content, recordedByPath.get(relPath), opts);
    if (verdict === 'unchanged') continue;
    if (verdict === 'skip-drifted') {
      result.skipped.push(relPath);
      result.skippedDriftCount++;
      continue;
    }
    result.toWrite[relPath] = content;
  }
  return result;
}

/** Prints the `--dry-run` preview for one whole-file entry. */
function printDryRunEntryPreview(
  entry: ManifestEntry,
  toWrite: Record<string, string>,
  skipped: string[],
): void {
  if (Object.keys(toWrite).length === 0 && skipped.length === 0) {
    console.log(`  =  ${entry.id}  (up-to-date)`);
    return;
  }
  console.log(`  ↑  ${entry.id}`);
  for (const p of Object.keys(toWrite)) console.log(`     ~ ${p}`);
  for (const p of skipped) console.log(`     ⊘ ${p}  (drifted — would skip without --force)`);
}

/** Parameters for {@link writeAndRefreshEntry}, bundled to stay under the project's max-params. */
interface WriteAndRefreshOptions {
  entry: ManifestEntry;
  freshFiles: Record<string, string>;
  toWrite: Record<string, string>;
  skipped: string[];
  resolved: ResolvedCatalog;
  opts: UpdateOptions;
}

/** Writes the updated files, prints the result, and refreshes manifest hashes in place. */
function writeAndRefreshEntry({
  entry,
  freshFiles,
  toWrite,
  skipped,
  resolved,
  opts,
}: WriteAndRefreshOptions): void {
  writeFilesSync(toWrite, opts.projectDir);
  console.log(`  ✓  ${entry.id}  (${Object.keys(toWrite).length} file(s) updated)`);
  for (const p of skipped) console.log(`     ⊘ ${p}  (drifted — skipped)`);

  const { toKeep } = applyStaleMigration(entry, freshFiles, opts.projectDir);
  entry.files = rebuildEntryFiles(entry, freshFiles, toKeep, opts.projectDir);

  // Refresh the recorded template revision so `status` stops reporting this entry as outdated.
  entry.template = currentTemplateOfId(entry.id, resolved);
}

/** Prints the no-write-needed outcome: either drifted (kept) or already up-to-date. */
function printNoWriteOutcome(entry: ManifestEntry, skipped: string[]): void {
  if (skipped.length > 0) {
    console.log(`  ~  ${entry.id}  (drifted — run with --force to overwrite)`);
    for (const p of skipped) console.log(`     ~ ${p}`);
  } else {
    console.log(`  =  ${entry.id}  (already up-to-date)`);
  }
}

/** Everything one whole-file entry's re-scaffold needs to decide write vs. skip vs. dry-run. */
interface PlannedUpdate {
  toWrite: Record<string, string>;
  skipped: string[];
  skippedDriftCount: number;
  staleToDelete: string[];
}

function planUpdate(
  entry: ManifestEntry,
  freshFiles: Record<string, string>,
  opts: UpdateOptions,
): PlannedUpdate {
  const { toWrite, skipped, skippedDriftCount } = partitionFreshFiles(entry, freshFiles, opts);
  const { toDelete: staleToDelete } = stalePaths(entry, freshFiles, opts.projectDir);
  return { toWrite, skipped, skippedDriftCount, staleToDelete };
}

/** Context {@link applyPlannedUpdate} needs beyond the plan itself — bundled to stay under the
 * project's max-params. */
interface UpdateEntryCtx {
  entry: ManifestEntry;
  freshFiles: Record<string, string>;
  resolved: ResolvedCatalog;
  opts: UpdateOptions;
}

/** Applies a planned update: writes/refreshes when there's something to do, else the no-op path. */
function applyPlannedUpdate(ctx: UpdateEntryCtx, plan: PlannedUpdate): WholeFileUpdateResult {
  const { entry, freshFiles, resolved, opts } = ctx;
  const { toWrite, skipped, skippedDriftCount, staleToDelete } = plan;
  if (Object.keys(toWrite).length > 0 || staleToDelete.length > 0) {
    writeAndRefreshEntry({ entry, freshFiles, toWrite, skipped, resolved, opts });
    return { updated: true, skippedDriftCount };
  }
  printNoWriteOutcome(entry, skipped);
  return { updated: false, skippedDriftCount };
}

/** Re-scaffolds one whole-file entry, partitions fresh content into write/skip, and applies it. */
export async function updateWholeFileEntry(
  entry: ManifestEntry,
  resolved: ResolvedCatalog,
  target: Target,
  opts: UpdateOptions,
): Promise<WholeFileUpdateResult> {
  const freshFiles = await scaffoldFreshFiles(entry, resolved, target, opts);
  if (!freshFiles) return { updated: false, skippedDriftCount: 0 };

  const plan = planUpdate(entry, freshFiles, opts);

  if (opts.dryRun) {
    printDryRunEntryPreview(entry, plan.toWrite, plan.skipped);
    for (const p of plan.staleToDelete) console.log(`     - ${p}  (would be removed — superseded)`);
    const pending = Object.keys(plan.toWrite).length > 0 || plan.staleToDelete.length > 0;
    return { updated: false, pending, skippedDriftCount: plan.skippedDriftCount };
  }

  return applyPlannedUpdate({ entry, freshFiles, resolved, opts }, plan);
}
