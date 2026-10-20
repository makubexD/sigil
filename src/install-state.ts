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
import type { Target, ResolvedCatalog } from './types';
import { prescaffoldUntracked } from './install-state-prescaffold';
import { entryKey, staleEntries } from './freshness';
import { retiredConfigDestinationsOf } from './targets';

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

/** Determines the install state for a candidate not tracked in the manifest. */
function resolveUntrackedState(
  artifact: { kind: string },
  id: string,
  freshByArtifact: Map<string, string[]>,
  projectDir: string,
): InstallState {
  if (CONFIG_KINDS.has(artifact.kind)) {
    // Config kinds: sigil owns only a fragment inside a shared JSON file.
    // The config file itself existing means nothing about sigil's fragment.
    // Not in manifest → treat as 'new'.
    return 'new';
  }
  // Whole-file kind: 'foreign' if any scaffold output path already exists on disk.
  const anyOnDisk = (freshByArtifact.get(id) ?? []).some(relPath =>
    fs.existsSync(path.join(projectDir, relPath)),
  );
  return anyOnDisk ? 'foreign' : 'new';
}

/** Builds one ArtifactInstallState entry from a single computeStatus result. */
function buildInstallStateEntry(
  sr: ReturnType<typeof computeStatus>[number],
): ArtifactInstallState {
  const { entry, status, driftedFiles, missingFiles } = sr;
  return {
    id: entry.id,
    kind: entry.kind,
    state: status as InstallState,
    ...(driftedFiles.length > 0 ? { driftedFiles } : {}),
    ...(missingFiles.length > 0 ? { missingFiles } : {}),
  };
}

/** Builds the result map from computeStatus's per-entry results. */
function buildResultFromStatusResults(
  statusResults: ReturnType<typeof computeStatus>,
): Map<string, ArtifactInstallState> {
  const result = new Map<string, ArtifactInstallState>();
  for (const sr of statusResults) {
    const entry = buildInstallStateEntry(sr);
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
  manifest: Manifest;
  catalogIds: Set<string>;
  refused?: ReadonlyMap<string, string> | undefined;
}

/** Adds an entry for every candidate not yet tracked in `result` (mutates `result` in place). */
function fillUntrackedCandidates(
  result: Map<string, ArtifactInstallState>,
  ctx: InstallStateCtx,
  freshByArtifact: Map<string, string[]>,
): void {
  for (const id of ctx.candidateIds) {
    if (result.has(id)) continue;
    const artifact = ctx.catalog.byId.get(id);
    if (!artifact) continue;

    const state = resolveUntrackedState(artifact, id, freshByArtifact, ctx.projectDir);
    result.set(id, { id, kind: artifact.kind, state });
  }
}

/**
 * Runs computeStatus for the tracked candidates. Outdated comes from `staleEntries`, the check
 * `status` uses, run over the whole manifest so each render sees everything installed.
 */
async function computeStatusResultsFor(
  ctx: InstallStateCtx,
): Promise<ReturnType<typeof computeStatus>> {
  const subManifest = buildSubManifest(ctx.manifest, ctx.target.name, ctx.candidateIds);
  const candidates = new Set(ctx.candidateIds);
  const stale = await staleEntries(ctx.manifest, {
    resolved: ctx.catalog,
    projectDir: ctx.projectDir,
    targetOf: name => (name === ctx.target.name ? ctx.target : undefined),
    refused: ctx.refused,
    only: entry => candidates.has(entry.id),
  });
  return computeStatus(subManifest, ctx.projectDir, ctx.catalogIds, {
    retiredFor: retiredConfigDestinationsOf,
    isStale: entry => stale.has(entryKey(entry)),
  });
}

/**
 * Runs the full prescaffold + computeStatus pipeline, returning everything the final
 * result-building step needs.
 */
async function runInstallStatePipeline(ctx: InstallStateCtx): Promise<{
  statusResults: ReturnType<typeof computeStatus>;
  freshByArtifact: Map<string, string[]>;
}> {
  const [freshByArtifact, statusResults] = await Promise.all([
    prescaffoldUntracked(ctx),
    computeStatusResultsFor(ctx),
  ]);
  return { statusResults, freshByArtifact };
}

/** Builds the pipeline context: loads the manifest and computes the catalog id set. */
function buildInstallStateCtx(options: ComputeInstallStatesOptions): InstallStateCtx {
  const { candidateIds, target, catalog, projectDir, refused } = options;
  const manifest = loadManifest(projectDir);
  const catalogIds = new Set(catalog.artifacts.map(a => a.id));
  return { candidateIds, target, catalog, projectDir, manifest, catalogIds, refused };
}

/** Parameters for {@link computeInstallStates}. */
export interface ComputeInstallStatesOptions {
  candidateIds: string[];
  target: Target;
  catalog: ResolvedCatalog;
  projectDir: string;
  /** Rule ids whose overlay was refused: `update` leaves them as installed, so they are never outdated. */
  refused?: ReadonlyMap<string, string> | undefined;
}

/**
 * Compute the install state of every candidate artifact against a target project.
 *
 * A tracked candidate is `outdated` exactly when `sigil update` would rewrite it (`staleEntries`,
 * src/freshness.ts). Rendering is in memory, so the extra scaffold calls are cheap.
 */
export async function computeInstallStates(
  options: ComputeInstallStatesOptions,
): Promise<Map<string, ArtifactInstallState>> {
  const ctx = buildInstallStateCtx(options);
  const { statusResults, freshByArtifact } = await runInstallStatePipeline(ctx);

  const result = buildResultFromStatusResults(statusResults);
  fillUntrackedCandidates(result, ctx, freshByArtifact);
  return result;
}
