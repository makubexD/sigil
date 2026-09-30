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
import { loadManifest, computeStatus, sha256 } from './manifest';
import type { Manifest } from './manifest';
import { canonicalize } from './config-merge';
import { CONFIG_KINDS } from './select';
import type { Target, ResolvedCatalog, ConfigScope } from './types';

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

// ── scaffoldHashesForArtifact ─────────────────────────────────────────────────

/**
 * Scaffold a single whole-file artifact and return `path → sha256` for each output file.
 * Returns null if scaffolding is not supported or fails.
 *
 * Exported so `sigil update` can share the same computation rather than
 * duplicating the inline scaffold-hash logic from cli.ts:1407-1418.
 */
export async function scaffoldHashesForArtifact(
  id: string,
  target: Target,
  catalog: ResolvedCatalog,
  projectDir: string,
): Promise<Map<string, string> | null> {
  if (!target.scaffold) return null;
  try {
    const freshFiles = await target.scaffold(id, catalog, {
      projectDir,
      overwrite: true,
      includeDeps: false,
    });
    const hashes = new Map<string, string>();
    for (const [relPath, content] of Object.entries(freshFiles)) {
      hashes.set(relPath, sha256(content));
    }
    return hashes;
  } catch {
    return null;
  }
}

// ── computeInstallStates ──────────────────────────────────────────────────────

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
  candidateIds: string[],
  target: Target,
  catalog: ResolvedCatalog,
  projectDir: string,
  scope: ConfigScope = 'project',
): Promise<Map<string, ArtifactInstallState>> {
  const manifest = loadManifest(projectDir);
  const catalogIds = new Set(catalog.artifacts.map(a => a.id));

  const wholeFileIds = candidateIds.filter(
    id => !CONFIG_KINDS.has(catalog.byId.get(id)?.kind ?? ''),
  );
  const configKindIds = candidateIds.filter(id =>
    CONFIG_KINDS.has(catalog.byId.get(id)?.kind ?? ''),
  );

  // ── Pre-scaffold fresh hashes for whole-file kinds ─────────────────────────
  // computeStatus's scaffoldHashFn must be synchronous; we pre-compute here so
  // the closure below is a plain Map lookup.
  const freshByArtifact = new Map<string, Map<string, string>>();
  for (const id of wholeFileIds) {
    const hashes = await scaffoldHashesForArtifact(id, target, catalog, projectDir);
    if (hashes) freshByArtifact.set(id, hashes);
  }

  // ── Pre-scaffold config kinds for outdated detection ─────────────────────
  // computeStatus's scaffoldHashFn path only checks entry.files, which is always
  // empty for config kinds. Detect config 'outdated' separately by comparing
  // fresh fragment sha256 vs the recorded fragmentSha256.
  const freshConfigHashByArtifact = new Map<string, string[]>(); // id → per-op fragment hashes
  if (target.scaffoldConfig) {
    for (const id of configKindIds) {
      try {
        const ops = await target.scaffoldConfig(id, catalog, {
          projectDir,
          scope,
          includeDeps: false,
        });
        freshConfigHashByArtifact.set(
          id,
          ops.map(op => sha256(canonicalize(op.fragment))),
        );
      } catch {
        // Scaffold failed — can't determine freshness; the id will fall through
        // to 'new' (if not in manifest) or keep the computeStatus result.
      }
    }
  }

  // ── Run computeStatus over manifest entries for these candidates ───────────
  // Filter the manifest to just the target platform + candidate IDs to avoid
  // processing the entire manifest on every call.
  const candidateSet = new Set(candidateIds);
  const subManifest: Manifest = {
    manifestVersion: manifest.manifestVersion,
    entries: manifest.entries.filter(e => e.target === target.name && candidateSet.has(e.id)),
  };

  const statusResults = computeStatus(
    subManifest,
    projectDir,
    catalogIds,
    (id, _tgt) => freshByArtifact.get(id) ?? null,
  );

  // ── Build result map ───────────────────────────────────────────────────────
  const result = new Map<string, ArtifactInstallState>();

  for (const sr of statusResults) {
    const { entry, status, driftedFiles, missingFiles } = sr;
    let finalState: InstallState = status as InstallState;

    // Post-process config kinds: check if catalog fragment changed (outdated).
    // computeStatus's 'outdated' branch walks entry.files, which is always empty
    // for config kinds — so we fill the gap using fragmentSha256 records.
    if (finalState === 'up-to-date' && CONFIG_KINDS.has(entry.kind)) {
      const freshHashes = freshConfigHashByArtifact.get(entry.id);
      if (freshHashes && entry.configFiles && entry.configFiles.length > 0) {
        const isOutdated = entry.configFiles.some((cf, i) => {
          const fh = freshHashes[i];
          return fh !== undefined && fh !== cf.fragmentSha256;
        });
        if (isOutdated) finalState = 'outdated';
      }
    }

    result.set(entry.id, {
      id: entry.id,
      kind: entry.kind,
      state: finalState,
      ...(driftedFiles.length > 0 ? { driftedFiles } : {}),
      ...(missingFiles.length > 0 ? { missingFiles } : {}),
    });
  }

  // ── Handle candidates NOT tracked in the manifest ─────────────────────────
  const trackedIds = new Set(result.keys());

  for (const id of candidateIds) {
    if (trackedIds.has(id)) continue;
    const artifact = catalog.byId.get(id);
    if (!artifact) continue;

    let state: InstallState;

    if (CONFIG_KINDS.has(artifact.kind)) {
      // Config kinds: sigil owns only a fragment inside a shared JSON file.
      // The config file itself existing means nothing about sigil's fragment.
      // Not in manifest → treat as 'new'.
      state = 'new';
    } else {
      // Whole-file kind: 'foreign' if any scaffold output path already exists on disk.
      const freshHashes = freshByArtifact.get(id);
      const anyOnDisk = freshHashes
        ? [...freshHashes.keys()].some(relPath => fs.existsSync(path.join(projectDir, relPath)))
        : false;
      state = anyOnDisk ? 'foreign' : 'new';
    }

    result.set(id, { id, kind: artifact.kind, state });
  }

  return result;
}
