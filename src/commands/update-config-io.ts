/**
 * File I/O shared by the two `sigil update` config paths (restore in update-config.ts, catalog
 * change in update-config-catalog.ts): locate a recorded fragment's file, read it, and write a
 * merge back. Split out so neither module imports the other.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolveContained } from '../cli-helpers';
import { replaceMerge, serialize } from '../config-merge';
import { resolveConfigRoot, isHomeScopedRoot, ensureHomeBackup } from '../config-utils';
import { recordedOp } from '../manifest';
import type { ManifestConfigMerge } from '../manifest/types';
import type { ConfigMergeOp, ConfigRoot } from '../types';

/** Read+parse a config JSON file; returns {} for a missing file, undefined for invalid JSON. */
function readConfigFile(fullPath: string): Record<string, unknown> | undefined {
  if (!fs.existsSync(fullPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * Writes `next` into `fullPath`, first reversing `previous` (the fragment being superseded)
 * when there is one, creating parent dirs.
 */
export function writeMergedConfigFile(
  fullPath: string,
  existing: Record<string, unknown>,
  ops: { previous?: ConfigMergeOp | undefined; next: ConfigMergeOp },
): void {
  if (isHomeScopedRoot(ops.next.root)) ensureHomeBackup(fullPath);
  const merged = replaceMerge(existing, ops.previous, ops.next);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, serialize(merged), 'utf-8');
}

/** Resolves the on-disk path + ConfigMergeOp for a recorded config-merge entry. */
export function resolveConfigFileTarget(
  cf: ManifestConfigMerge,
  projectDir: string,
): { fullPath: string; op: ConfigMergeOp } {
  const rootDir = resolveConfigRoot(cf.root as ConfigRoot | undefined, projectDir);
  // The manifest is committed and editable: never follow a recorded path out of its root.
  return { fullPath: resolveContained(rootDir, cf.file), op: recordedOp(cf) };
}

/** Reads the existing config JSON, or logs + returns undefined if it's not valid JSON. */
export function readExistingOrWarn(
  fullPath: string,
  entryId: string,
  cfFile: string,
): Record<string, unknown> | undefined {
  const existing = readConfigFile(fullPath);
  if (existing === undefined) {
    console.error(`  ✗  ${entryId}: ${cfFile} exists but is not valid JSON. Skipped.`);
  }
  return existing;
}
