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
import { applyCatalog, mergeDependentOf } from './mutate-shared';
import type { CatalogSource, Manifest, ManifestEntry, ManifestConfigMerge } from './types';

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
  /**
   * The catalog this install came from, from `sourceToRecord(...)`: `undefined` for the bundled
   * catalog (no key recorded). Omit it entirely to leave an existing entry's record untouched.
   */
  catalog?: CatalogSource | undefined;
  /**
   * Install-variable values to record under the artifact's declared names. Omit it entirely to
   * leave an existing entry's record untouched; an empty record writes no key.
   */
  vars?: Record<string, string> | undefined;
}

/**
 * Stores `vars` on the entry when given, dropping the key for an empty record. An omitted
 * `vars` leaves whatever the entry already holds.
 */
function applyVars(entry: ManifestEntry, vars: Record<string, string> | undefined): void {
  if (vars === undefined) return;
  if (Object.keys(vars).length === 0) delete entry.vars;
  else entry.vars = vars;
}

/** Updates an existing config-kind manifest entry in place with fresh fragments + timestamp. */
function refreshExistingConfigEntry(
  existing: ManifestEntry,
  configFiles: ManifestConfigMerge[],
  options: UpsertConfigEntryOptions,
): void {
  applyCatalog(existing, options);
  applyVars(existing, options.vars);
  existing.configFiles = configFiles;
  existing.sigilVersion = options.sigilVersion;
  existing.installedAt = options.now;
  mergeDependentOf(existing.dependentOf, options.dependentOf);
}

/** Builds a brand-new config-kind manifest entry for an id that isn't recorded yet. */
function buildNewConfigEntry(
  options: UpsertConfigEntryOptions,
  configFiles: ManifestConfigMerge[],
): ManifestEntry {
  const entry: ManifestEntry = {
    id: options.id,
    kind: options.kind,
    target: options.target,
    sigilVersion: options.sigilVersion,
    files: [],
    configFiles,
    dependentOf: options.dependentOf,
    installedAt: options.now,
  };
  applyCatalog(entry, options);
  applyVars(entry, options.vars);
  return entry;
}

/**
 * Upsert a config-kind artifact (hook, settings, mcp) into the manifest.
 * Records ConfigMergeOps as partial-ownership fragments rather than whole-file hashes.
 */
export function upsertConfigEntry(manifest: Manifest, options: UpsertConfigEntryOptions): void {
  const { id, target, ops } = options;
  const existing = manifest.entries.find(e => e.id === id && e.target === target);
  const configFiles = buildConfigFiles(ops);

  if (existing) {
    refreshExistingConfigEntry(existing, configFiles, options);
    return;
  }

  manifest.entries.push(buildNewConfigEntry(options, configFiles));
}
