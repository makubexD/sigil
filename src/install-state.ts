/**
 * Install-state detection for `sigil add` and the interactive wizard.
 *
 * Computes per-artifact installation states by combining:
 *   - The local manifest (.sigil/manifest.json)
 *   - On-disk file content (sha256 comparison via computeStatus)
 *   - Fresh scaffold output (async, so computeStatus gets a sync lookup)
 *   - Config-kind fragment hashes (outdated detection for mcp/hook/settings)
 *
 * States form a 6-value enum that drives default picker selection and add-command
 * skip logic:
 *
 *   new        — never installed; default action: write
 *   foreign    — files on disk but not recorded by sigil (whole-file kinds only); default: conflict
 *   up-to-date — installed, content matches bundled catalog; default: skip
 *   drifted    — installed, user edited one or more files; default: conflict
 *   outdated   — installed, catalog changed since install; default: conflict (suggest sigil update)
 *   missing    — recorded in manifest but file(s) deleted from disk; default: write (restore)
 */

import fs from 'fs';
import path from 'path';
import { loadManifest, computeStatus } from './manifest';
import type { Manifest } from './manifest';
import { CONFIG_KINDS } from './select';
import type { Target, ResolvedCatalog, ConfigScope } from './types';
import { prescaffoldAll } from './install-state-prescaffold';

export { scaffoldHashesForArtifact } from './install-state-prescaffold';

// ── Public types ──────────────────────────────────────────────────────────────

export type InstallState =
  | 'new' //        never installed
  | 'foreign' //    files on disk, not tracked by sigil (whole-file kinds only)
  | 'up-to-date' // installed and content matches bundled catalog
  | 'drifted' //    installed, user edited one or more files
  | 'outdated' //   installed, catalog has changed since install
  | 'missing'; //   recorded in manifest but file(s) gone from disk

export interface ArtifactInstallState {
  id: string;
  kind: string;
  state: InstallState;
  /** Files whose on-disk content differs from the manifest-recorded hash (drifted state). */
  driftedFiles?: string[];
  /** Files recorded in the manifest that no longer exist on disk (missing state). */
  missingFiles?: string[];
}

// ── computeInstallStates ──────────────────────────────────────────────────────

/** Builds the sub-manifest limited to this target + these candidate ids. */
function buildSubManifest(
  manifest: Manifest,
  targetName: string,
  candidateIds: string[],
): Manifest {
  const candidateSet = new Set(candidateIds);
  return {
    manifestVersion: manifest.manifestVersion,
    entries: manifest.entries.filter(e => e.target === targetName && candidateSet.has(e.id)),
  };
}

/**
 * Post-processes a config-kind `up-to-date` status into `outdated` when the catalog's
 * fragment has changed since install. No-op for whole-file kinds or non-up-to-date states.
 */
function resolveConfigOutdatedState(
  entry: { id: string; kind: string; configFiles?: { fragmentSha256: string }[] },
  status: InstallState,
  freshConfigHashByArtifact: Map<string, string[]>,
): InstallState {
  if (status !== 'up-to-date' || !CONFIG_KINDS.has(entry.kind)) return status;

  const freshHashes = freshConfigHashByArtifact.get(entry.id);
  if (!freshHashes || !entry.configFiles || entry.configFiles.length === 0) return status;

  const isOutdated = entry.configFiles.some((cf, i) => {
    const fh = freshHashes[i];
    return fh !== undefined && fh !== cf.fragmentSha256;
  });
  return isOutdated ? 'outdated' : status;
}

/** Determines the install state for a candidate not tracked in the manifest. */
function resolveUntrackedState(
  artifact: { kind: string },
  id: string,
  freshByArtifact: Map<string, Map<string, string>>,
  projectDir: string,
): InstallState {
  if (CONFIG_KINDS.has(artifact.kind)) {
    // Config kinds: sigil owns only a fragment inside a shared JSON file.
    // The config file itself existing means nothing about sigil's fragment.
    // Not in manifest → treat as 'new'.
    return 'new';
  }
  // Whole-file kind: 'foreign' if any scaffold output path already exists on disk.
  const freshHashes = freshByArtifact.get(id);
  const anyOnDisk = freshHashes
    ? [...freshHashes.keys()].some(relPath => fs.existsSync(path.join(projectDir, relPath)))
    : false;
  return anyOnDisk ? 'foreign' : 'new';
}

/** Builds one ArtifactInstallState entry from a single computeStatus result. */
function buildInstallStateEntry(
  sr: ReturnType<typeof computeStatus>[number],
  freshConfigHashByArtifact: Map<string, string[]>,
): ArtifactInstallState {
  const { entry, status, driftedFiles, missingFiles } = sr;
  const finalState = resolveConfigOutdatedState(
    entry,
    status as InstallState,
    freshConfigHashByArtifact,
  );

  return {
    id: entry.id,
    kind: entry.kind,
    state: finalState,
    ...(driftedFiles.length > 0 ? { driftedFiles } : {}),
    ...(missingFiles.length > 0 ? { missingFiles } : {}),
  };
}

/** Builds the result map from computeStatus's per-entry results, applying config-outdated post-processing. */
function buildResultFromStatusResults(
  statusResults: ReturnType<typeof computeStatus>,
  freshConfigHashByArtifact: Map<string, string[]>,
): Map<string, ArtifactInstallState> {
  const result = new Map<string, ArtifactInstallState>();
  for (const sr of statusResults) {
    const entry = buildInstallStateEntry(sr, freshConfigHashByArtifact);
    result.set(entry.id, entry);
  }
  return result;
}

/** Shared context threaded through the computeInstallStates pipeline helpers below. */
interface InstallStateCtx {
  candidateIds: string[];
  target: Target;
  catalog: ResolvedCatalog;
  projectDir: string;
  scope: ConfigScope;
  manifest: Manifest;
  catalogIds: Set<string>;
}

/** Adds an entry for every candidate not yet tracked in `result` (mutates `result` in place). */
function fillUntrackedCandidates(
  result: Map<string, ArtifactInstallState>,
  ctx: InstallStateCtx,
  freshByArtifact: Map<string, Map<string, string>>,
): void {
  for (const id of ctx.candidateIds) {
    if (result.has(id)) continue;
    const artifact = ctx.catalog.byId.get(id);
    if (!artifact) continue;

    const state = resolveUntrackedState(artifact, id, freshByArtifact, ctx.projectDir);
    result.set(id, { id, kind: artifact.kind, state });
  }
}

/** Builds the sub-manifest and runs computeStatus for this candidate set. */
function computeStatusResultsFor(
  ctx: InstallStateCtx,
  freshByArtifact: Map<string, Map<string, string>>,
): ReturnType<typeof computeStatus> {
  const subManifest = buildSubManifest(ctx.manifest, ctx.target.name, ctx.candidateIds);
  return computeStatus(subManifest, ctx.projectDir, ctx.catalogIds, {
    scaffoldHashFn: id => freshByArtifact.get(id) ?? null,
    retiredFor: () => ctx.target.retiredConfigDestinations ?? [],
  });
}

/**
 * Runs the full prescaffold + computeStatus pipeline, returning everything the final
 * result-building step needs.
 */
async function runInstallStatePipeline(ctx: InstallStateCtx): Promise<{
  statusResults: ReturnType<typeof computeStatus>;
  freshByArtifact: Map<string, Map<string, string>>;
  freshConfigHashByArtifact: Map<string, string[]>;
}> {
  const { freshByArtifact, freshConfigHashByArtifact } = await prescaffoldAll(ctx);
  const statusResults = computeStatusResultsFor(ctx, freshByArtifact);
  return { statusResults, freshByArtifact, freshConfigHashByArtifact };
}

/** Builds the pipeline context: loads the manifest and computes the catalog id set. */
function buildInstallStateCtx(
  options: ComputeInstallStatesOptions & { scope: ConfigScope },
): InstallStateCtx {
  const { candidateIds, target, catalog, projectDir, scope } = options;
  const manifest = loadManifest(projectDir);
  const catalogIds = new Set(catalog.artifacts.map(a => a.id));
  return { candidateIds, target, catalog, projectDir, scope, manifest, catalogIds };
}

/** Parameters for {@link computeInstallStates}. */
export interface ComputeInstallStatesOptions {
  candidateIds: string[];
  target: Target;
  catalog: ResolvedCatalog;
  projectDir: string;
  /**
   * For config-kind candidates (mcp/hook/settings), the scope that would be used at
   * install time, so the correct destination file is used during scaffolding.
   */
  scope?: ConfigScope;
}

/**
 * Compute the install state of every candidate artifact against a target project.
 *
 * Performance: pre-scaffolds each whole-file candidate to get fresh content hashes
 * for 'outdated' detection. This parallels what `add` does immediately after, so
 * the extra scaffold calls are cheap (catalog is small; scaffold is in-memory).
 *
 * For config-kind candidates (mcp/hook/settings), supply the `scope` that would be
 * used at install time so the correct destination file is used during scaffolding.
 * Defaults to `'project'`.
 */
export async function computeInstallStates(
  options: ComputeInstallStatesOptions,
): Promise<Map<string, ArtifactInstallState>> {
  const { scope = 'project' } = options;
  const ctx = buildInstallStateCtx({ ...options, scope });
  const { statusResults, freshByArtifact, freshConfigHashByArtifact } =
    await runInstallStatePipeline(ctx);

  const result = buildResultFromStatusResults(statusResults, freshConfigHashByArtifact);
  fillUntrackedCandidates(result, ctx, freshByArtifact);
  return result;
}
