/**
 * Config-kind (hook/settings/mcp) drift check for status.ts — compares a manifest's recorded
 * JSON-merge fragment against the live on-disk file. Split out of status.ts to keep that file
 * under the repo's own module-size threshold.
 *
 * @module
 */
import fs from 'fs';
import { classifyConfigDrift } from '../config-merge';
import { resolveConfigRoot } from '../config-utils';
import { resolveContained } from '../contained-path';
import type { ConfigMergeOp, ConfigRoot, MergeStrategy, RetiredConfigDestination } from '../types';
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

/**
 * Labels a non-intact drift class for display. `missing` and `modified` used to be
 * indistinguishable (both just "drifted") — see F14 (docs/decisions/catalog-usage-audit-2026-08-21.md):
 * that ambiguity is what let `sigil update` silently decline to repair a fragment that was simply
 * gone, since it read identically to a real user edit that needed `--force` to safely overwrite.
 */
function driftLabel(file: string, drift: 'missing' | 'modified'): string {
  return drift === 'missing'
    ? `${file} (fragment missing — restorable via 'sigil update')`
    : `${file} (values changed — needs 'sigil update --force')`;
}

/** Where a recorded fragment lives: under its root (project, home, …), never outside it. */
function recordedPath(cf: ManifestConfigMerge, projectDir: string): string {
  const root = resolveConfigRoot((cf.root as ConfigRoot | undefined) ?? 'project', projectDir);
  return resolveContained(root, cf.file); // the manifest is editable: stay in the root
}

/** Checks one config-fragment record against its live on-disk JSON file. */
function checkOneConfigFile(
  cf: ManifestConfigMerge,
  projectDir: string,
  driftedFiles: string[],
  missingFiles: string[],
): void {
  const fullPath = recordedPath(cf, projectDir);
  if (!fs.existsSync(fullPath)) {
    missingFiles.push(cf.file);
    return;
  }
  const live = readLiveConfigJson(fullPath);
  if (!live) {
    driftedFiles.push(cf.file); // unreadable JSON counts as drift
    return;
  }
  const drift = classifyConfigDrift(live, toConfigMergeOp(cf));
  if (drift !== 'intact') driftedFiles.push(driftLabel(cf.file, drift));
}

/** What checking an entry's config records found, by kind of problem. */
export interface ConfigFileFindings {
  readonly driftedFiles: string[];
  readonly missingFiles: string[];
  /** Records at a file the provider retired; `sigil update` moves them. */
  readonly movedFiles: string[];
}

const atRetired = (cf: ManifestConfigMerge, retired: readonly RetiredConfigDestination[]) =>
  retired.some(r => r.from.file === cf.file && r.from.root === ((cf.root as string) ?? 'project'));

/** Checks every config-fragment record on `entry` against its live on-disk JSON file. */
export function checkConfigFiles(
  entry: ManifestEntry,
  projectDir: string,
  retired: readonly RetiredConfigDestination[],
  found: ConfigFileFindings,
): void {
  for (const cf of entry.configFiles!) {
    if (atRetired(cf, retired)) found.movedFiles.push(cf.file);
    else checkOneConfigFile(cf, projectDir, found.driftedFiles, found.missingFiles);
  }
}
