/**
 * Stale-path migration logic for `sigil update` — split out of update-wholefile.ts to keep that
 * file under the repo's own module-size threshold.
 *
 * Handles the case where an artifact's emit path changed between the manifest-recorded scaffold
 * and the current one (e.g. `.claude/commands/<slug>.md` -> `.claude/skills/<slug>/SKILL.md`).
 * Without this, `sigil update` would write the new file but never track it (the manifest still
 * pointed at the old path) and leave the old file orphaned on disk forever.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { sha256 } from '../manifest';
import type { ManifestEntry, ManifestFile } from '../manifest/types';

/**
 * Returns true when the file on disk has been modified since sigil recorded it.
 * A file that does not exist yet is NOT considered drifted — it simply needs writing.
 *
 * Lives here (not update-wholefile.ts, which re-exports it) so this module has no dependency on
 * that one — update-wholefile.ts imports stalePaths/applyStaleMigration/rebuildEntryFiles FROM
 * here, and a two-way import between the pair would be a circular dependency.
 */
export function isFileDrifted(fullPath: string, recordedHash: string | undefined): boolean {
  if (!recordedHash) return false;
  if (!fs.existsSync(fullPath)) return false;
  const diskHash = sha256(fs.readFileSync(fullPath, 'utf-8'));
  return diskHash !== recordedHash;
}

/**
 * Recorded paths from a previous scaffold layout that the current one no longer produces. A stale
 * path is safe to delete only when its on-disk content still matches what sigil recorded —
 * proving sigil owns it and the user never edited it. A stale-but-drifted file is reported and
 * kept, same as any other user edit.
 */
export function stalePaths(
  entry: ManifestEntry,
  freshFiles: Record<string, string>,
  projectDir: string,
): { toDelete: string[]; toKeep: string[] } {
  const freshPaths = new Set(Object.keys(freshFiles));
  const toDelete: string[] = [];
  const toKeep: string[] = [];
  for (const mf of entry.files) {
    if (freshPaths.has(mf.path)) continue;
    const fullPath = path.join(projectDir, mf.path);
    if (isFileDrifted(fullPath, mf.sha256)) {
      toKeep.push(mf.path);
    } else {
      toDelete.push(mf.path);
    }
  }
  return { toDelete, toKeep };
}

/** Deletes a stale file from disk if it still exists; silent no-op otherwise. */
function deleteStaleFile(relPath: string, projectDir: string): void {
  const fullPath = path.join(projectDir, relPath);
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
}

/** Prints the write outcome + the stale-path migration lines, deletes the safe-to-delete stale
 * paths as a side effect (kept ones are reported only). */
export function applyStaleMigration(
  entry: ManifestEntry,
  freshFiles: Record<string, string>,
  projectDir: string,
): { toKeep: string[] } {
  const { toDelete, toKeep } = stalePaths(entry, freshFiles, projectDir);
  for (const p of toDelete) {
    deleteStaleFile(p, projectDir);
    console.log(`     - ${p}  (removed — superseded by current output)`);
  }
  for (const p of toKeep) {
    console.log(
      `     ⊘ ${p}  (superseded, but locally edited — kept; rerun with --force to remove)`,
    );
  }
  return { toKeep };
}

/** Rebuilds `entry.files` from the CURRENT scaffold's path set, not the stale recorded one — this
 * is what makes an emit-path change (e.g. a kind switching output layout) actually re-track under
 * its new path instead of leaving the new file permanently untracked by the manifest. Kept-stale
 * (locally-edited) paths are carried over unchanged. */
export function rebuildEntryFiles(
  entry: ManifestEntry,
  freshFiles: Record<string, string>,
  keptStalePaths: string[],
  projectDir: string,
): ManifestFile[] {
  const keptStale = new Set(keptStalePaths);
  const carriedOver = entry.files.filter(mf => keptStale.has(mf.path));
  // Index once by path instead of an entry.files.find() per fresh file below — was
  // O(freshFiles * entry.files); fixed in the 2026-08-26 round after a dogfooded
  // ts-performance-profiler run flagged the sibling pattern in uninstall.ts/prune-apply.ts (see
  // docs/audits/2026-08-25/register.md's backlog).
  const shaByPath = new Map(entry.files.map(mf => [mf.path, mf.sha256]));
  const freshRecorded = Object.keys(freshFiles).map(relPath => {
    const fullPath = path.join(projectDir, relPath);
    const sha = fs.existsSync(fullPath)
      ? sha256(fs.readFileSync(fullPath, 'utf-8'))
      : (shaByPath.get(relPath) ?? '');
    return { path: relPath, sha256: sha };
  });
  return [...freshRecorded, ...carriedOver];
}
