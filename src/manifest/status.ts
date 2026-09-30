/**
 * Artifact status computation: compare manifest records against disk content and
 * current catalog membership to determine each entry's health.
 *
 * Status values:
 *   up-to-date — hashes match and id still in catalog
 *   outdated   — id in catalog but scaffold output differs from recorded hashes
 *   drifted    — at least one file's on-disk content differs from recorded hash
 *   orphaned   — id no longer exists in the bundled catalog
 *   missing    — at least one recorded file is absent from disk
 */
import fs from 'fs';
import path from 'path';
import { detectConfigDrift } from '../config-merge';
import type { ConfigMergeOp, MergeStrategy } from '../types';
import { isConfigKind } from '../kinds';
import { sha256 } from './hash';
import type { Manifest, ManifestEntry, StatusResult } from './types';

/**
 * Compute the status of all manifest entries.
 *
 * `catalogIds` is the set of artifact IDs present in the current bundled catalog.
 * `scaffoldHashFn` is called to re-compute what the scaffold output would produce
 * today (used for 'outdated' detection). Pass `undefined` to skip outdated checks.
 */
export function computeStatus(
  manifest: Manifest,
  projectDir: string,
  catalogIds: Set<string>,
  scaffoldHashFn?: (id: string, target: string) => Map<string, string> | null,
): StatusResult[] {
  return manifest.entries.map(entry =>
    statusForEntry(entry, projectDir, catalogIds, scaffoldHashFn),
  );
}

function statusForEntry(
  entry: ManifestEntry,
  projectDir: string,
  catalogIds: Set<string>,
  scaffoldHashFn?: (id: string, target: string) => Map<string, string> | null,
): StatusResult {
  const driftedFiles: string[] = [];
  const missingFiles: string[] = [];

  if (isConfigKind(entry.kind) && entry.configFiles && entry.configFiles.length > 0) {
    checkConfigFiles(entry, projectDir, driftedFiles, missingFiles);
  } else {
    checkWholeFiles(entry, projectDir, driftedFiles, missingFiles);
  }

  return deriveStatus(entry, catalogIds, driftedFiles, missingFiles, scaffoldHashFn);
}

function checkConfigFiles(
  entry: ManifestEntry,
  projectDir: string,
  driftedFiles: string[],
  missingFiles: string[],
): void {
  for (const cf of entry.configFiles!) {
    const fullPath = path.join(projectDir, cf.file);
    if (!fs.existsSync(fullPath)) {
      missingFiles.push(cf.file);
      continue;
    }
    let live: Record<string, unknown>;
    try {
      live = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      driftedFiles.push(cf.file); // unreadable JSON counts as drift
      continue;
    }
    const op: ConfigMergeOp = {
      file: cf.file,
      fragment: cf.fragment,
      strategy: cf.strategy as Record<string, MergeStrategy>,
    };
    if (detectConfigDrift(live, op)) {
      driftedFiles.push(cf.file);
    }
  }
}

function checkWholeFiles(
  entry: ManifestEntry,
  projectDir: string,
  driftedFiles: string[],
  missingFiles: string[],
): void {
  for (const mf of entry.files) {
    const fullPath = path.join(projectDir, mf.path);
    if (!fs.existsSync(fullPath)) {
      missingFiles.push(mf.path);
    } else {
      const current = sha256(fs.readFileSync(fullPath, 'utf-8'));
      if (current !== mf.sha256) {
        driftedFiles.push(mf.path);
      }
    }
  }
}

function deriveStatus(
  entry: ManifestEntry,
  catalogIds: Set<string>,
  driftedFiles: string[],
  missingFiles: string[],
  scaffoldHashFn?: (id: string, target: string) => Map<string, string> | null,
): StatusResult {
  if (missingFiles.length > 0) {
    return { entry, status: 'missing', driftedFiles, missingFiles };
  }
  if (!catalogIds.has(entry.id)) {
    return { entry, status: 'orphaned', driftedFiles, missingFiles };
  }
  if (driftedFiles.length > 0) {
    return { entry, status: 'drifted', driftedFiles, missingFiles };
  }
  if (scaffoldHashFn) {
    const fresh = scaffoldHashFn(entry.id, entry.target);
    if (fresh) {
      const isOutdated = entry.files.some(mf => {
        const freshHash = fresh.get(mf.path);
        return freshHash !== undefined && freshHash !== mf.sha256;
      });
      if (isOutdated) {
        return { entry, status: 'outdated', driftedFiles, missingFiles };
      }
    }
  }
  return { entry, status: 'up-to-date', driftedFiles, missingFiles };
}

/**
 * Compute the "last-installed" sha256 hash for every recorded file path,
 * keyed by relative path. Used by the `update` command to know which files
 * are safe to overwrite (not user-drifted).
 */
export function recordedHashes(manifest: Manifest, target: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of manifest.entries) {
    if (entry.target !== target) continue;
    for (const mf of entry.files) {
      map.set(mf.path, mf.sha256);
    }
  }
  return map;
}
