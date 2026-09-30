/**
 * upsertEntries — record whole-file artifacts (skill, agent, rule, prompt, workflow) into the
 * manifest. Config-kind upsert (mutate-config.ts) and entry removal (mutate-remove.ts) are split
 * into sibling files to keep this one under the repo's own module-size threshold; both are
 * re-exported from src/manifest/index.ts alongside this one.
 */
import fs from 'fs';
import path from 'path';
import { sha256 } from './hash';
import { mergeDependentOf } from './mutate-shared';
import type { Manifest, ManifestEntry, ManifestFile } from './types';

/** Unique key for a manifest entry: id + target combination. */
function entryKey(id: string, target: string): string {
  return `${target}:${id}`;
}

/** Build `ManifestFile[]` (path + content hash) for a set of written relative paths. */
function buildManifestFiles(relPaths: string[], projectDir: string): ManifestFile[] {
  return relPaths.map(p => ({
    path: p,
    sha256: sha256(fs.readFileSync(path.join(projectDir, p), 'utf-8')),
  }));
}

/** Shared context threaded through {@link upsertOneEntry} calls within a single {@link upsertEntries} run. */
interface UpsertContext {
  byKey: Map<string, ManifestEntry>;
  target: string;
  projectDir: string;
  sigilVersion: string;
  now: string;
}

/** One artifact's data to upsert into the manifest, besides the shared UpsertContext. */
interface EntryInput {
  id: string;
  kind: string;
  relPaths: string[];
  dependentOf: string[];
  /** The template this artifact composed against, and its revision, at scaffold time. */
  template?: { id: string; revision: number } | undefined;
}

/** Updates an existing whole-file manifest entry in place with fresh files + timestamp. */
function refreshExistingEntry(
  existing: ManifestEntry,
  ctx: UpsertContext,
  files: ManifestFile[],
  input: EntryInput,
): void {
  existing.files = files;
  existing.sigilVersion = ctx.sigilVersion;
  existing.installedAt = ctx.now;
  existing.template = input.template;
  mergeDependentOf(existing.dependentOf, input.dependentOf);
}

/** Builds a brand-new whole-file manifest entry for an id that isn't recorded yet. */
function buildNewEntry(
  ctx: UpsertContext,
  input: EntryInput,
  files: ManifestFile[],
): ManifestEntry {
  return {
    id: input.id,
    kind: input.kind,
    target: ctx.target,
    sigilVersion: ctx.sigilVersion,
    files,
    dependentOf: input.dependentOf,
    installedAt: ctx.now,
    template: input.template,
  };
}

/** Upsert a single whole-file artifact entry into `ctx.byKey` (mutated in place). */
function upsertOneEntry(ctx: UpsertContext, input: EntryInput): void {
  const key = entryKey(input.id, ctx.target);
  const files = buildManifestFiles(input.relPaths, ctx.projectDir);

  const existing = ctx.byKey.get(key);
  if (existing) {
    refreshExistingEntry(existing, ctx, files, input);
  } else {
    ctx.byKey.set(key, buildNewEntry(ctx, input, files));
  }
}

/** Parameters for {@link upsertEntries}, besides the manifest being mutated. */
export interface UpsertEntriesOptions {
  /** Platform name (e.g. "claude"). */
  target: string;
  /** IDs the user explicitly requested. */
  primaryIds: string[];
  /** Map of dep-id → list of primary IDs that depend on it. */
  depMap: Map<string, string[]>;
  /** Map of artifact-id → written FileMap paths. */
  filesByArtifact: Map<
    string,
    { relPaths: string[]; kind: string; template?: { id: string; revision: number } | undefined }
  >;
  /** Consumer project root (for hashing). */
  projectDir: string;
  /** npm package version. */
  sigilVersion: string;
  /** ISO timestamp — stamped by the CLI layer, not Date.now(). */
  now: string;
}

/** Upserts every primary pick (empty `dependentOf`). */
function upsertPrimaryEntries(ctx: UpsertContext, options: UpsertEntriesOptions): void {
  for (const id of options.primaryIds) {
    const info = options.filesByArtifact.get(id);
    if (!info) continue;
    upsertOneEntry(ctx, {
      id,
      kind: info.kind,
      relPaths: info.relPaths,
      dependentOf: [],
      template: info.template,
    });
  }
}

/** Upserts every dependency (parent-tagged via `dependentOf`). */
function upsertDependencyEntries(ctx: UpsertContext, options: UpsertEntriesOptions): void {
  for (const [depId, parents] of options.depMap) {
    const info = options.filesByArtifact.get(depId);
    if (!info) continue;
    upsertOneEntry(ctx, {
      id: depId,
      kind: info.kind,
      relPaths: info.relPaths,
      template: info.template,
      dependentOf: parents,
    });
  }
}

/**
 * Upsert a set of installed artifacts into the manifest.
 *
 * For each primary pick, we record its files with an empty `dependentOf` list.
 * For each dependency, we record its files and append the parent ID to `dependentOf`
 * (if the dep is already recorded, we merge the parent into the existing entry).
 *
 * @param manifest Current manifest (mutated in place).
 */
export function upsertEntries(manifest: Manifest, options: UpsertEntriesOptions): void {
  const { target, projectDir, sigilVersion, now } = options;
  const ctx: UpsertContext = {
    byKey: new Map<string, ManifestEntry>(manifest.entries.map(e => [entryKey(e.id, e.target), e])),
    target,
    projectDir,
    sigilVersion,
    now,
  };

  upsertPrimaryEntries(ctx, options);
  upsertDependencyEntries(ctx, options);
  manifest.entries = [...ctx.byKey.values()];
}
