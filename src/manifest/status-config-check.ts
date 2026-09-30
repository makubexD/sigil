/**
 * Config-kind (hook/settings/mcp) drift check for status.ts — compares a manifest's recorded
 * JSON-merge fragment against the live on-disk file. Split out of status.ts to keep that file
 * under the repo's own module-size threshold.
 *
 * @module
 */
import fs from 'fs';
import path from 'path';
import { detectConfigDrift } from '../config-merge';
import type { ConfigMergeOp, MergeStrategy } from '../types';
import type { ManifestConfigMerge, ManifestEntry } from './types';

/** Reads and parses an existing JSON config file; returns undefined when it's unparseable. */
function readLiveConfigJson(fullPath: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Builds the ConfigMergeOp shape `detectConfigDrift` expects from a manifest fragment record. */
function toConfigMergeOp(cf: ManifestConfigMerge): ConfigMergeOp {
  return {
    file: cf.file,
    fragment: cf.fragment,
    strategy: cf.strategy as Record<string, MergeStrategy>,
  };
}

/** Checks one config-fragment record against its live on-disk JSON file. */
function checkOneConfigFile(
  cf: ManifestConfigMerge,
  projectDir: string,
  driftedFiles: string[],
  missingFiles: string[],
): void {
  const fullPath = path.join(projectDir, cf.file);
  if (!fs.existsSync(fullPath)) {
    missingFiles.push(cf.file);
    return;
  }
  const live = readLiveConfigJson(fullPath);
  if (!live) {
    driftedFiles.push(cf.file); // unreadable JSON counts as drift
    return;
  }
  if (detectConfigDrift(live, toConfigMergeOp(cf))) driftedFiles.push(cf.file);
}

/** Checks every config-fragment record on `entry` against its live on-disk JSON file. */
export function checkConfigFiles(
  entry: ManifestEntry,
  projectDir: string,
  driftedFiles: string[],
  missingFiles: string[],
): void {
  for (const cf of entry.configFiles!) {
    checkOneConfigFile(cf, projectDir, driftedFiles, missingFiles);
  }
}
