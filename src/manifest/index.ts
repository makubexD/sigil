/**
 * manifest — install manifest for sigil consumer projects.
 *
 * Records what sigil has scaffolded into a project so lifecycle commands
 * (status, update, uninstall) can operate correctly.
 *
 * Sub-modules:
 *   types   — schema types and constants
 *   io      — loadManifest, saveManifest, manifestPath
 *   hash    — sha256, hashFiles
 *   mutate  — upsertEntries, upsertConfigEntry, removeEntries
 *   status  — computeStatus, recordedHashes
 */

export type {
  ManifestFile,
  ManifestConfigMerge,
  ManifestEntry,
  Manifest,
  ArtifactStatus,
  StatusResult,
} from './types';
export { MANIFEST_VERSION, MANIFEST_RELATIVE_PATH } from './types';
export { manifestPath, loadManifest, saveManifest } from './io';
export { sha256, hashFiles } from './hash';
export { upsertEntries } from './mutate';
export { upsertConfigEntry } from './mutate-config';
export { removeEntries } from './mutate-remove';
export { computeStatus, recordedHashes } from './status';
export type { CurrentTemplateOf } from './status';
