/**
 * `sigil uninstall` — config-kind (hook/settings/mcp) reverse-merge helpers.
 * Split out of uninstall.ts to keep that file under the repo's own module-size threshold.
 *
 * @module
 */
import fs from 'node:fs';
import { resolveContained } from '../cli-helpers';
import { resolveConfigRoot, isHomeScopedRoot, ensureHomeBackup } from '../config-utils';
import { reverseMerge, serialize } from '../config-merge';
import type { ConfigRoot, ConfigMergeOp, MergeStrategy } from '../types';
import type { ManifestEntry } from '../manifest';

/** Builds the ConfigMergeOp from a recorded manifest config-merge entry. */
function buildConfigMergeOpFromEntry(
  cf: NonNullable<ManifestEntry['configFiles']>[number],
): ConfigMergeOp {
  return {
    file: cf.file,
    root: cf.root as ConfigRoot | undefined,
    fragment: cf.fragment,
    strategy: cf.strategy as Record<string, MergeStrategy>,
  };
}

/** Writes (or deletes, if now empty) the reverse-merged config file; prints the result line. */
function writeReversedConfigFile(
  fullPath: string,
  cleaned: Record<string, unknown>,
  displayPath: string,
): void {
  if (Object.keys(cleaned).length === 0) {
    fs.unlinkSync(fullPath);
    console.log(`  - ${displayPath}  (emptied, deleted)`);
  } else {
    fs.writeFileSync(fullPath, serialize(cleaned), 'utf-8');
    console.log(`  ~ ${displayPath}  (JSON reverse-merge applied)`);
  }
}

/** Reverse-merges and removes sigil's contribution from one config-merge file; returns true
 * if it counted as removed (write succeeded or the file was deleted after emptying). */
function reverseMergeOneConfigFile(
  cf: NonNullable<ManifestEntry['configFiles']>[number],
  projectDir: string,
): boolean {
  const rootDir = resolveConfigRoot((cf.root as ConfigRoot | undefined) ?? 'project', projectDir);
  const fullPath = resolveContained(rootDir, cf.file); // the manifest is editable: stay in root
  const isHomeWrite = isHomeScopedRoot(cf.root as ConfigRoot | undefined);
  const displayPath = isHomeWrite ? fullPath : cf.file;
  if (!fs.existsSync(fullPath)) return false;

  try {
    if (isHomeWrite) ensureHomeBackup(fullPath);
    const live = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as Record<string, unknown>;
    const cleaned = reverseMerge(live, buildConfigMergeOpFromEntry(cf));
    writeReversedConfigFile(fullPath, cleaned, displayPath);
    return true;
  } catch (err) {
    console.warn(`  ⚠  Could not reverse-merge ${displayPath}: ${(err as Error).message}`);
    return false;
  }
}

/** Reverse-merges and removes sigil's contribution from each config-kind entry's JSON files. */
export function reverseMergeConfigEntries(
  configEntriesToRemove: ManifestEntry[],
  projectDir: string,
): number {
  let configRemovedCount = 0;
  for (const entry of configEntriesToRemove) {
    for (const cf of entry.configFiles ?? []) {
      if (reverseMergeOneConfigFile(cf, projectDir)) configRemovedCount++;
    }
  }
  return configRemovedCount;
}
