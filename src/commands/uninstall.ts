/**
 * `sigil uninstall <ids...>` command — remove installed artifacts from a consumer project.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { confirm, isCancel, cancel, note } from '@clack/prompts';
import { detectProjectTarget } from '../cli-helpers';
import { saveManifest, removeEntries, sha256 } from '../manifest';
import { requireManifest } from './shared/manifest';
import { isInteractiveTTY } from '../wizard';
import { chooseIdsToUninstall } from './uninstall-guided';
import type { ManifestEntry } from '../manifest';
import { SigilError } from '../errors';
import { configEntriesOf, reverseMergeConfigEntries } from './uninstall-config';

export interface UninstallOptions {
  projectDir: string;
  target?: string | undefined;
  yes: boolean;
  force: boolean;
  dryRun: boolean;
}

/** Throws if any requested id isn't recorded in the manifest for this target. */
function assertIdsInstalled(
  ids: string[],
  manifest: { entries: ManifestEntry[] },
  targetName: string,
): void {
  const notFound = ids.filter(
    id => !manifest.entries.some(e => e.id === id && e.target === targetName),
  );
  if (notFound.length > 0) {
    throw new SigilError(`Not installed (target '${targetName}'): ${notFound.join(', ')}`, {
      hint: '  Run `sigil status` to see installed artifacts.',
    });
  }
}

/** Finds paths whose on-disk content no longer matches the manifest-recorded hash. */
function findDriftedPaths(
  pathsToDelete: string[],
  removedEntries: ManifestEntry[],
  projectDir: string,
): string[] {
  // Index once by path instead of re-flattening removedEntries on every iteration below — was
  // O(pathsToDelete * removedEntries) via a fresh flatMap().find() per path; fixed in the
  // 2026-08-26 round after a dogfooded ts-performance-profiler run flagged it (see
  // docs/audits/2026-08-25/register.md's backlog).
  const recordedByPath = new Map(removedEntries.flatMap(e => e.files).map(f => [f.path, f]));
  const driftedPaths: string[] = [];
  for (const p of pathsToDelete) {
    const fullPath = path.join(projectDir, p);
    if (!fs.existsSync(fullPath)) continue;
    const recorded = recordedByPath.get(p);
    if (recorded) {
      const diskHash = sha256(fs.readFileSync(fullPath, 'utf-8'));
      if (diskHash !== recorded.sha256) driftedPaths.push(p);
    }
  }
  return driftedPaths;
}

/** Prints the `--dry-run` preview: files that would be removed + config merges reversed. */
function printDryRunPreview(
  pathsToDelete: string[],
  driftedPaths: string[],
  configEntriesToRemove: ManifestEntry[],
): void {
  console.log(
    `\nDry run — would remove ${pathsToDelete.length} file(s) and reverse ${configEntriesToRemove.length} JSON merge(s):`,
  );
  for (const p of pathsToDelete) {
    const drifted = driftedPaths.includes(p);
    console.log(`  - ${p}${drifted ? '  (drifted)' : ''}`);
  }
  for (const e of configEntriesToRemove) {
    for (const cf of e.configFiles ?? []) {
      console.log(`  ~ ${cf.file}  (JSON reverse-merge for ${e.id})`);
    }
  }
  console.log('\nNo files were removed (--dry-run).');
}

/** Prints the "N file(s) were modified after install" note box when there are drifted paths. */
function printDriftedFilesNote(driftedPaths: string[], opts: UninstallOptions): void {
  if (driftedPaths.length === 0 || opts.force) return;
  note(
    `${driftedPaths.length} file(s) were modified after install:\n` +
      driftedPaths.map(p => `  ${p}`).join('\n') +
      '\n\nThey will NOT be deleted. Use --force to remove them anyway.',
    '⚠  Drifted files',
  );
}

/** Prompts to confirm the uninstall (skipped when --yes). Returns false if cancelled. */
async function promptUninstallConfirmation(ids: string[], targetName: string): Promise<boolean> {
  const ok = await confirm({
    message: `Remove ${ids.join(', ')} from '${targetName}'?`,
    initialValue: false,
  });
  if (isCancel(ok) || !ok) {
    cancel('Uninstall cancelled.');
    return false;
  }
  return true;
}

/** Warns about drifted files, then confirms the uninstall unless --yes was passed. Returns
 * true to proceed, false if the user cancelled. Throws if non-interactive without --yes. */
async function confirmUninstall(
  ids: string[],
  targetName: string,
  driftedPaths: string[],
  opts: UninstallOptions,
): Promise<boolean> {
  printDriftedFilesNote(driftedPaths, opts);

  if (!opts.yes && !isInteractiveTTY()) {
    throw new SigilError('stdin/stdout is not interactive. Re-run with --yes to confirm.');
  }

  if (!opts.yes) return promptUninstallConfirmation(ids, targetName);
  return true;
}

/** Deletes whole-file kind files (skipping drifted ones unless --force), pruning empty dirs. */
/** Best-effort removal of `dir` if it's now empty — ENOENT/ENOTEMPTY are expected, not errors. */
function removeIfEmptyDir(dir: string): void {
  try {
    if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT' && code !== 'ENOTEMPTY') {
      console.warn(`  ⚠  Could not remove empty directory ${dir}: ${(err as Error).message}`);
    }
  }
}

function deleteWholeFiles(
  pathsToDelete: string[],
  driftedPaths: string[],
  opts: UninstallOptions,
): void {
  for (const p of pathsToDelete) {
    if (driftedPaths.includes(p) && !opts.force) continue;
    const fullPath = path.join(opts.projectDir, p);
    try {
      fs.unlinkSync(fullPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue; // already missing — fine
      console.warn(`  ⚠  Could not remove ${fullPath}: ${(err as Error).message}`);
      continue;
    }
    removeIfEmptyDir(path.dirname(fullPath));
  }
}

/** Counts/paths needed by {@link printUninstallSummary} beyond `ids`/`opts`. */
interface UninstallSummaryStats {
  pathsToDelete: string[];
  driftedPaths: string[];
  configRemovedCount: number;
}

/** Prints the final `✓ Uninstalled: ...` summary line. */
function printUninstallSummary(
  ids: string[],
  stats: UninstallSummaryStats,
  opts: UninstallOptions,
): void {
  const { pathsToDelete, driftedPaths, configRemovedCount } = stats;
  const keptCount = opts.force ? 0 : driftedPaths.length;
  console.log(
    `\n✓ Uninstalled: ${ids.join(', ')}` +
      `  (${pathsToDelete.length - keptCount} file(s) removed` +
      (configRemovedCount > 0 ? `, ${configRemovedCount} JSON merge(s) reversed` : '') +
      (driftedPaths.length > 0 && !opts.force
        ? `, ${driftedPaths.length} drifted file(s) kept`
        : '') +
      ')',
  );
  console.log('');
}

export async function runUninstall(ids: string[], opts: UninstallOptions): Promise<void> {
  const targetName = opts.target ?? detectProjectTarget(opts.projectDir, { verbose: false });
  const manifest = requireManifest(opts.projectDir);
  const chosen =
    ids.length > 0
      ? ids
      : await chooseIdsToUninstall(manifest.entries, targetName, opts.projectDir);
  if (chosen) await uninstallIds(chosen, manifest, targetName, opts);
}

async function uninstallIds(
  ids: string[],
  manifest: ReturnType<typeof requireManifest>,
  targetName: string,
  opts: UninstallOptions,
): Promise<void> {
  assertIdsInstalled(ids, manifest, targetName);
  const { pathsToDelete, removedEntries } = removeEntries(manifest, ids, targetName);
  const configEntries = configEntriesOf(removedEntries);
  const driftedPaths = findDriftedPaths(pathsToDelete, removedEntries, opts.projectDir);
  if (opts.dryRun) {
    printDryRunPreview(pathsToDelete, driftedPaths, configEntries);
    return;
  }
  if (!(await confirmUninstall(ids, targetName, driftedPaths, opts))) return;
  deleteWholeFiles(pathsToDelete, driftedPaths, opts);
  finishUninstall(ids, manifest, { pathsToDelete, driftedPaths, configEntries }, opts);
}

/** Reverses config merges, saves the manifest and prints the summary, after files are deleted. */
function finishUninstall(
  ids: string[],
  manifest: ReturnType<typeof requireManifest>,
  plan: Omit<UninstallSummaryStats, 'configRemovedCount'> & { configEntries: ManifestEntry[] },
  opts: UninstallOptions,
): void {
  const { pathsToDelete, driftedPaths, configEntries } = plan;
  // removeEntries left only what stays installed in manifest.entries
  const configRemovedCount = reverseMergeConfigEntries(
    configEntries,
    opts.projectDir,
    manifest.entries,
  );
  saveManifest(opts.projectDir, manifest);
  printUninstallSummary(ids, { pathsToDelete, driftedPaths, configRemovedCount }, opts);
}
