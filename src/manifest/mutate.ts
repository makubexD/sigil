/**
 * Manifest mutation helpers: upsert and remove.
 *
 * upsertEntries    — record whole-file artifacts (skill, agent, rule, prompt, workflow)
 * upsertConfigEntry — record config-kind artifacts (hook, settings, mcp) as fragments
 * removeEntries    — remove entries by ID, returning paths safe to delete from disk
 */
import fs from 'fs';
import path from 'path';
import { canonicalize } from '../config-merge';
import type { ConfigMergeOp } from '../types';
import { sha256 } from './hash';
import type { Manifest, ManifestEntry, ManifestFile, ManifestConfigMerge } from './types';

/** Unique key for a manifest entry: id + target combination. */
function entryKey(id: string, target: string): string {
  return `${target}:${id}`;
}

/**
 * Upsert a set of installed artifacts into the manifest.
 *
 * For each primary pick, we record its files with an empty `dependentOf` list.
 * For each dependency, we record its files and append the parent ID to `dependentOf`
 * (if the dep is already recorded, we merge the parent into the existing entry).
 *
 * @param manifest         Current manifest (mutated in place).
 * @param target           Platform name (e.g. "claude").
 * @param primaryIds       IDs the user explicitly requested.
 * @param depMap           Map of dep-id → list of primary IDs that depend on it.
 * @param filesByArtifact  Map of artifact-id → written FileMap paths.
 * @param projectDir       Consumer project root (for hashing).
 * @param sigilVersion     npm package version.
 * @param now              ISO timestamp — stamped by the CLI layer, not Date.now().
 */
export function upsertEntries(
  manifest: Manifest,
  target: string,
  primaryIds: string[],
  depMap: Map<string, string[]>,
  filesByArtifact: Map<string, { relPaths: string[]; kind: string }>,
  projectDir: string,
  sigilVersion: string,
  now: string,
): void {
  const byKey = new Map<string, ManifestEntry>(
    manifest.entries.map(e => [entryKey(e.id, e.target), e]),
  );

  const upsert = (id: string, kind: string, relPaths: string[], dependentOf: string[]): void => {
    const key = entryKey(id, target);
    const files: ManifestFile[] = relPaths.map(p => ({
      path: p,
      sha256: sha256(fs.readFileSync(path.join(projectDir, p), 'utf-8')),
    }));

    const existing = byKey.get(key);
    if (existing) {
      existing.files = files;
      existing.sigilVersion = sigilVersion;
      existing.installedAt = now;
      for (const parent of dependentOf) {
        if (!existing.dependentOf.includes(parent)) {
          existing.dependentOf.push(parent);
        }
      }
    } else {
      const entry: ManifestEntry = {
        id,
        kind,
        target,
        sigilVersion,
        files,
        dependentOf,
        installedAt: now,
      };
      byKey.set(key, entry);
    }
  };

  for (const id of primaryIds) {
    const info = filesByArtifact.get(id);
    if (info) upsert(id, info.kind, info.relPaths, []);
  }

  for (const [depId, parents] of depMap) {
    const info = filesByArtifact.get(depId);
    if (info) upsert(depId, info.kind, info.relPaths, parents);
  }

  manifest.entries = [...byKey.values()];
}

/**
 * Upsert a config-kind artifact (hook, settings, mcp) into the manifest.
 * Records ConfigMergeOps as partial-ownership fragments rather than whole-file hashes.
 *
 * @param manifest     Current manifest (mutated in place).
 * @param id           Artifact ID.
 * @param kind         Artifact kind ('hook' | 'settings' | 'mcp').
 * @param target       Platform adapter name.
 * @param ops          Merge ops produced by scaffoldConfig().
 * @param dependentOf  Parent IDs if this is a dep.
 * @param sigilVersion npm package version.
 * @param now          ISO timestamp — stamped by the CLI layer.
 */
export function upsertConfigEntry(
  manifest: Manifest,
  id: string,
  kind: string,
  target: string,
  ops: ConfigMergeOp[],
  dependentOf: string[],
  sigilVersion: string,
  now: string,
): void {
  const existing = manifest.entries.find(e => e.id === id && e.target === target);

  const configFiles: ManifestConfigMerge[] = ops.map(op => ({
    file: op.file,
    ...(op.root && op.root !== 'project' ? { root: op.root } : {}),
    fragment: op.fragment,
    strategy: op.strategy as Record<string, string>,
    fragmentSha256: sha256(canonicalize(op.fragment)),
  }));

  if (existing) {
    existing.configFiles = configFiles;
    existing.sigilVersion = sigilVersion;
    existing.installedAt = now;
    for (const parent of dependentOf) {
      if (!existing.dependentOf.includes(parent)) {
        existing.dependentOf.push(parent);
      }
    }
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

/**
 * Remove manifest entries for the given IDs + target, returning the file paths
 * that should be deleted from disk (refcount-aware: a file is only returned when
 * no remaining entry still references it).
 */
export function removeEntries(
  manifest: Manifest,
  ids: string[],
  target: string,
): { pathsToDelete: string[]; removedEntries: ManifestEntry[] } {
  const idSet = new Set(ids);

  const removed: ManifestEntry[] = [];
  const remaining: ManifestEntry[] = [];

  for (const entry of manifest.entries) {
    if (entry.target === target && idSet.has(entry.id)) {
      removed.push(entry);
    } else {
      remaining.push(entry);
    }
  }

  // Strip removed ids from the `dependentOf` lists of remaining entries
  for (const entry of remaining) {
    entry.dependentOf = entry.dependentOf.filter(d => !idSet.has(d));
  }

  manifest.entries = remaining;

  // Paths safe to delete: referenced only by removed entries
  const remainingPaths = new Set(
    remaining.filter(e => e.target === target).flatMap(e => e.files.map(f => f.path)),
  );

  const removedPaths = removed.flatMap(e => e.files.map(f => f.path));
  const pathsToDelete = removedPaths.filter(p => !remainingPaths.has(p));

  return { pathsToDelete, removedEntries: removed };
}
