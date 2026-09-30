/**
 * `--apply`/render plumbing for `sigil prune`, split out of prune.ts to keep that file under the
 * repo's own module-size threshold.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { confirm, isCancel, cancel } from '@clack/prompts';
import { saveManifest, removeEntries, sha256 } from '../manifest';
import { requireManifest } from './shared/manifest';
import { CONFIG_KINDS } from '../select';
import { isInteractiveTTY } from '../wizard';
import type { ManifestEntry } from '../manifest';
import { SigilError } from '../errors';
import { reverseMergeConfigEntries } from './uninstall-config';
import type { PruneCandidates, PruneOptions } from './prune';

/** Finds paths whose on-disk content no longer matches the manifest-recorded hash — same check
 * `sigil uninstall` uses, so a hand-edited file is treated identically by both commands. */
function findDriftedPaths(
  pathsToDelete: string[],
  removedEntries: ManifestEntry[],
  projectDir: string,
): string[] {
  const driftedPaths: string[] = [];
  for (const p of pathsToDelete) {
    const fullPath = path.join(projectDir, p);
    if (!fs.existsSync(fullPath)) continue;
    const recorded = removedEntries.flatMap(e => e.files).find(f => f.path === p);
    if (recorded) {
      const diskHash = sha256(fs.readFileSync(fullPath, 'utf-8'));
      if (diskHash !== recorded.sha256) driftedPaths.push(p);
    }
  }
  return driftedPaths;
}

/** Deletes whole-file kind files (skipping drifted ones unless --force), pruning empty dirs left
 * behind — identical behavior to uninstall.ts's deleteWholeFiles, kept as its own copy here since
 * sharing would mean threading UninstallOptions/PruneOptions through a common param type for a
 * six-line function; not worth the coupling. */
function deleteWholeFiles(
  pathsToDelete: string[],
  driftedPaths: string[],
  opts: PruneOptions,
): void {
  for (const p of pathsToDelete) {
    if (driftedPaths.includes(p) && !opts.force) continue;
    const fullPath = path.join(opts.projectDir, p);
    try {
      fs.unlinkSync(fullPath);
      const dir = path.dirname(fullPath);
      if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    } catch {
      // Already missing — fine.
    }
  }
}

/** Prompts to confirm removing the orphaned entries (skipped when --yes). */
async function confirmApply(orphanedIds: string[], opts: PruneOptions): Promise<boolean> {
  if (orphanedIds.length === 0) return true;
  if (!opts.yes && !isInteractiveTTY()) {
    throw new SigilError('stdin/stdout is not interactive. Re-run with --yes to confirm.');
  }
  if (opts.yes) return true;
  const ok = await confirm({
    message: `Remove ${orphanedIds.length} orphaned artifact(s): ${orphanedIds.join(', ')}?`,
    initialValue: false,
  });
  if (isCancel(ok) || !ok) {
    cancel('Prune cancelled.');
    return false;
  }
  return true;
}

/** Result of the actual file/manifest surgery, handed to {@link printApplySummary}. */
interface ApplyOutcome {
  removedCount: number;
  pathsDeleted: number;
  configRemovedCount: number;
  driftedKept: number;
}

/** What `removeEntries` + drift-scanning computed, ready for {@link writeRemoval}. */
interface ComputedRemoval {
  pathsToDelete: string[];
  driftedPaths: string[];
  removedEntries: ManifestEntry[];
}

/** Deletes files + reverses config merges for the computed removal set, and saves the manifest. */
function writeRemoval(
  manifest: ReturnType<typeof requireManifest>,
  computed: ComputedRemoval,
  opts: PruneOptions,
): number {
  const { pathsToDelete, driftedPaths, removedEntries } = computed;
  const configEntriesToRemove = removedEntries.filter(
    e => CONFIG_KINDS.has(e.kind) && e.configFiles && e.configFiles.length > 0,
  );
  deleteWholeFiles(pathsToDelete, driftedPaths, opts);
  const configRemovedCount = reverseMergeConfigEntries(configEntriesToRemove, opts.projectDir);
  saveManifest(opts.projectDir, manifest);
  return configRemovedCount;
}

/** Removes every orphaned entry's files + config merges. Mirrors runUninstall's apply path. */
function performRemoval(
  manifest: ReturnType<typeof requireManifest>,
  orphanedIds: string[],
  targetName: string,
  opts: PruneOptions,
): ApplyOutcome {
  const { pathsToDelete, removedEntries } = removeEntries(manifest, orphanedIds, targetName);
  const driftedPaths = findDriftedPaths(pathsToDelete, removedEntries, opts.projectDir);
  const computed = { pathsToDelete, driftedPaths, removedEntries };
  const configRemovedCount = writeRemoval(manifest, computed, opts);
  const driftedKept = opts.force ? 0 : driftedPaths.length;
  return {
    removedCount: orphanedIds.length,
    pathsDeleted: pathsToDelete.length - driftedKept,
    configRemovedCount,
    driftedKept,
  };
}

/** Prints the post-apply summary line + the deprecated-still-installed reminder. */
function printApplySummary(outcome: ApplyOutcome, deprecatedCount: number): void {
  console.log(
    `\n✓ Pruned ${outcome.removedCount} orphaned artifact(s)` +
      `  (${outcome.pathsDeleted} file(s) removed` +
      (outcome.configRemovedCount > 0
        ? `, ${outcome.configRemovedCount} JSON merge(s) reversed`
        : '') +
      (outcome.driftedKept > 0 ? `, ${outcome.driftedKept} drifted file(s) kept` : '') +
      ')',
  );
  if (deprecatedCount > 0) {
    console.log(
      `  ${deprecatedCount} deprecated artifact(s) still installed — re-run without --apply to see them.`,
    );
  }
  console.log('');
}

/** Context {@link applyPrune} needs beyond `manifest`/`candidates` — bundled to stay under the
 * project's max-params (targetName + opts + the caller-supplied JSON renderer). */
export interface ApplyPruneCtx {
  targetName: string;
  opts: PruneOptions;
  printJsonReport: (candidates: PruneCandidates, applied: boolean) => void;
}

/** Removes every orphaned entry; reports deprecated ones (never removed automatically — see
 * prune.ts's printPreview for the rationale). */
export async function applyPrune(
  manifest: ReturnType<typeof requireManifest>,
  candidates: PruneCandidates,
  ctx: ApplyPruneCtx,
): Promise<void> {
  const { targetName, opts, printJsonReport } = ctx;
  const orphanedIds = candidates.orphaned.map(e => e.id);
  if (orphanedIds.length === 0) {
    if (opts.json) printJsonReport(candidates, true);
    else console.log('\n✓ Nothing to prune — no orphaned artifacts installed.\n');
    return;
  }

  const proceed = await confirmApply(orphanedIds, opts);
  if (!proceed) return;

  const outcome = performRemoval(manifest, orphanedIds, targetName, opts);

  if (opts.json) printJsonReport(candidates, true);
  else printApplySummary(outcome, candidates.deprecated.length);
}
