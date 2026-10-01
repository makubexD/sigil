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
import { isConfigKind } from '../kinds';
import { sha256 } from './hash';
import { checkConfigFiles } from './status-config-check';
import type { Manifest, ManifestEntry, StatusResult } from './types';

/** Looks up an artifact's CURRENT `{id, revision}` template reference in the bundled catalog. */
export type CurrentTemplateOf = (id: string) => { id: string; revision: number } | undefined;

/** The two least-often-varied `computeStatus` params, bundled to stay under max-params. */
export interface ComputeStatusExtras {
  /** Called to re-compute what the scaffold output would produce today ('outdated' detection). */
  scaffoldHashFn?: ((id: string, target: string) => Map<string, string> | null) | undefined;
  /** Looks up an artifact's live template revision, letting `reason` name *why* it's outdated. */
  currentTemplateOf?: CurrentTemplateOf | undefined;
}

/**
 * Compute the status of all manifest entries.
 *
 * `catalogIds` is the set of artifact IDs present in the current bundled catalog. See
 * {@link ComputeStatusExtras} for the optional outdated-detection hooks.
 */
export function computeStatus(
  manifest: Manifest,
  projectDir: string,
  catalogIds: Set<string>,
  extras: ComputeStatusExtras = {},
): StatusResult[] {
  return manifest.entries.map(entry => statusForEntry(entry, projectDir, catalogIds, extras));
}

/** Runs the config-file or whole-file drift check, whichever applies to `entry`'s kind. */
function checkEntryFiles(
  entry: ManifestEntry,
  projectDir: string,
): { driftedFiles: string[]; missingFiles: string[] } {
  const driftedFiles: string[] = [];
  const missingFiles: string[] = [];
  if (isConfigKind(entry.kind) && entry.configFiles && entry.configFiles.length > 0) {
    checkConfigFiles(entry, projectDir, driftedFiles, missingFiles);
  } else {
    checkWholeFiles(entry, projectDir, driftedFiles, missingFiles);
  }
  return { driftedFiles, missingFiles };
}

function statusForEntry(
  entry: ManifestEntry,
  projectDir: string,
  catalogIds: Set<string>,
  extras: ComputeStatusExtras,
): StatusResult {
  const { driftedFiles, missingFiles } = checkEntryFiles(entry, projectDir);
  return deriveStatus({
    entry,
    catalogIds,
    driftedFiles,
    missingFiles,
    scaffoldHashFn: extras.scaffoldHashFn,
    currentTemplateOf: extras.currentTemplateOf,
  });
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

interface DeriveStatusOptions {
  entry: ManifestEntry;
  catalogIds: Set<string>;
  driftedFiles: string[];
  missingFiles: string[];
  scaffoldHashFn?: ((id: string, target: string) => Map<string, string> | null) | undefined;
  currentTemplateOf?: CurrentTemplateOf | undefined;
}

/** The live template revision for `entry`, when it differs from what was recorded at install. */
function templateRevisionMismatch(
  entry: ManifestEntry,
  currentTemplateOf: CurrentTemplateOf | undefined,
): { id: string; from: number; to: number } | undefined {
  if (!entry.template || !currentTemplateOf) return undefined;
  const live = currentTemplateOf(entry.id);
  if (!live || live.id !== entry.template.id || live.revision === entry.template.revision) {
    return undefined;
  }
  return { id: live.id, from: entry.template.revision, to: live.revision };
}

/** Checks whether a fresh scaffold run would produce different file hashes than recorded. */
function scaffoldHashesDiffer(
  entry: ManifestEntry,
  scaffoldHashFn: DeriveStatusOptions['scaffoldHashFn'],
): boolean {
  if (!scaffoldHashFn) return false;
  const fresh = scaffoldHashFn(entry.id, entry.target);
  if (!fresh) return false;
  return entry.files.some(mf => {
    const freshHash = fresh.get(mf.path);
    return freshHash !== undefined && freshHash !== mf.sha256;
  });
}

/** True when the entry's recorded output no longer matches what would be scaffolded today. */
function isOutdated(
  entry: ManifestEntry,
  scaffoldHashFn: DeriveStatusOptions['scaffoldHashFn'],
  currentTemplateOf: CurrentTemplateOf | undefined,
): boolean {
  return (
    templateRevisionMismatch(entry, currentTemplateOf) !== undefined ||
    scaffoldHashesDiffer(entry, scaffoldHashFn)
  );
}

/** The 'outdated' reason: names the template revision delta when known, else a generic note. */
function outdatedReason(
  entry: ManifestEntry,
  currentTemplateOf: CurrentTemplateOf | undefined,
): string {
  const mismatch = templateRevisionMismatch(entry, currentTemplateOf);
  return mismatch
    ? `template ${mismatch.id} rev ${mismatch.from}→${mismatch.to}`
    : 'newer scaffold output available';
}

/** Short human-readable explanation for a non-up-to-date status. */
function deriveReason(
  status: StatusResult['status'],
  options: DeriveStatusOptions,
): string | undefined {
  const { entry, driftedFiles, missingFiles, currentTemplateOf } = options;
  switch (status) {
    case 'missing':
      return `missing file(s): ${missingFiles.join(', ')}`;
    case 'orphaned':
      return 'no longer present in the bundled catalog';
    case 'drifted':
      return `local edits differ from installed content: ${driftedFiles.join(', ')}`;
    case 'outdated':
      return outdatedReason(entry, currentTemplateOf);
    case 'up-to-date':
      return undefined;
  }
}

function deriveStatus(options: DeriveStatusOptions): StatusResult {
  const { entry, catalogIds, driftedFiles, missingFiles, scaffoldHashFn, currentTemplateOf } =
    options;
  // Orphaned wins over missing: an artifact the catalog dropped cannot be restored, only cleaned up.
  const status: StatusResult['status'] = !catalogIds.has(entry.id)
    ? 'orphaned'
    : missingFiles.length > 0
      ? 'missing'
      : driftedFiles.length > 0
        ? 'drifted'
        : isOutdated(entry, scaffoldHashFn, currentTemplateOf)
          ? 'outdated'
          : 'up-to-date';

  const reason = deriveReason(status, options);
  return { entry, status, driftedFiles, missingFiles, ...(reason !== undefined ? { reason } : {}) };
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
