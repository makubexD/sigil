/**
 * upsertConfigEntry — record config-kind artifacts (hook, settings, mcp) as JSON-merge
 * fragments. Split out of mutate.ts (whole-file upsert) to keep that file under the
 * repo's own module-size threshold.
 *
 * @module
 */
import { canonicalize } from '../config-merge';
import type { ConfigMergeOp } from '../types';
import { sha256 } from './hash';
import { mergeDependentOf } from './mutate-shared';
import type { Manifest, ManifestEntry, ManifestConfigMerge } from './types';

/** Build `ManifestConfigMerge[]` fragments (with content hash) from scaffold-produced merge ops. */
function buildConfigFiles(ops: ConfigMergeOp[]): ManifestConfigMerge[] {
  return ops.map(op => ({
    file: op.file,
    ...(op.root && op.root !== 'project' ? { root: op.root } : {}),
    fragment: op.fragment,
    strategy: op.strategy as Record<string, string>,
    fragmentSha256: sha256(canonicalize(op.fragment)),
  }));
}

/** Parameters for {@link upsertConfigEntry}, besides the manifest being mutated. */
export interface UpsertConfigEntryOptions {
  /** Artifact ID. */
  id: string;
  /** Artifact kind ('hook' | 'settings' | 'mcp'). */
  kind: string;
  /** Platform adapter name. */
  target: string;
  /** Merge ops produced by scaffoldConfig(). */
  ops: ConfigMergeOp[];
  /** Parent IDs if this is a dep. */
  dependentOf: string[];
  /** npm package version. */
  sigilVersion: string;
  /** ISO timestamp — stamped by the CLI layer. */
  now: string;
}

/** Updates an existing config-kind manifest entry in place with fresh fragments + timestamp. */
function refreshExistingConfigEntry(
  existing: ManifestEntry,
  configFiles: ManifestConfigMerge[],
  options: UpsertConfigEntryOptions,
): void {
  existing.configFiles = configFiles;
  existing.sigilVersion = options.sigilVersion;
  existing.installedAt = options.now;
  mergeDependentOf(existing.dependentOf, options.dependentOf);
}

/**
 * Upsert a config-kind artifact (hook, settings, mcp) into the manifest.
 * Records ConfigMergeOps as partial-ownership fragments rather than whole-file hashes.
 */
export function upsertConfigEntry(manifest: Manifest, options: UpsertConfigEntryOptions): void {
  const { id, kind, target, ops, dependentOf, sigilVersion, now } = options;
  const existing = manifest.entries.find(e => e.id === id && e.target === target);
  const configFiles = buildConfigFiles(ops);

  if (existing) {
    refreshExistingConfigEntry(existing, configFiles, options);
    return;
  }

  manifest.entries.push({
    id,
    kind,
    target,
    sigilVersion,
    files: [],
    configFiles,
    dependentOf,
    installedAt: now,
  });
}
