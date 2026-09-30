/**
 * `sigil add` — execute phase: writes files, updates the manifest, and installs
 * config-kind (hook/settings/mcp) merges. Only ever called for a real (non-dry-run)
 * install — dry-run renders the same `AddPlan` instead (see render.ts).
 *
 * @module
 */
import { loadManifest, saveManifest, upsertEntries } from '../../manifest';
import type { Manifest } from '../../manifest';
import { writeFilesSync, pkg } from '../../cli-helpers';
import { printConflictAdvice } from '../../wizard';
import type { AddPlan } from './plan';
import { installConfigArtifacts } from './execute-config';
import { scaffoldManifestFiles, type FilesByArtifact } from './scaffold-files';

export interface AddOutcome {
  overwrittenCount: number;
  configWrittenCount: number;
}

/** Writes `toWrite`, plus `conflicting` when overwrite is allowed; else prints conflict advice. */
function writePlanFiles(plan: AddPlan): { overwrittenCount: number; conflictPaths: string[] } {
  const { opts, toWrite, conflicting } = plan;
  writeFilesSync(toWrite, opts.projectDir);

  const conflictPaths = Object.keys(conflicting);
  let overwrittenCount = 0;
  if (conflictPaths.length > 0) {
    if (plan.effectiveOverwrite) {
      writeFilesSync(conflicting, opts.projectDir);
      overwrittenCount = conflictPaths.length;
    } else {
      printConflictAdvice(conflictPaths);
    }
  }
  return { overwrittenCount, conflictPaths };
}

/** The scaffold-derived pieces needed to record whole-file manifest entries. */
interface FileManifestUpdate {
  depMap: Map<string, string[]>;
  filesByArtifact: Map<string, FilesByArtifact>;
  now: string;
}

/** Thin wrapper around upsertEntries that pulls its args from `plan` (keeps the call-site short). */
function recordFileManifestEntries(
  manifest: Manifest,
  plan: AddPlan,
  update: FileManifestUpdate,
): void {
  upsertEntries(manifest, {
    target: plan.targetName,
    primaryIds: plan.wholeFileIds,
    depMap: update.depMap,
    filesByArtifact: update.filesByArtifact,
    projectDir: plan.opts.projectDir,
    sigilVersion: pkg.version,
    now: update.now,
  });
}

async function updateFileManifest(
  plan: AddPlan,
  writtenPaths: Set<string>,
  manifest: Manifest,
  now: string,
): Promise<boolean> {
  if (writtenPaths.size === 0) return false;

  const { filesByArtifact, depMap } = await scaffoldManifestFiles(plan, writtenPaths);
  if (filesByArtifact.size === 0) return false;

  recordFileManifestEntries(manifest, plan, { depMap, filesByArtifact, now });
  return true;
}

/** Parameters for {@link tryUpdateFileManifest} beyond the shared plan/manifest. */
interface TryUpdateFileManifestOptions {
  toWrite: Record<string, string>;
  conflictPaths: string[];
  manifest: Manifest;
  now: string;
}

/** Updates the whole-file manifest entries; swallows and warns on any failure. */
async function tryUpdateFileManifest(
  plan: AddPlan,
  options: TryUpdateFileManifestOptions,
): Promise<boolean> {
  const { toWrite, conflictPaths, manifest, now } = options;
  try {
    const writtenPaths = new Set([
      ...Object.keys(toWrite),
      ...(plan.effectiveOverwrite ? conflictPaths : []),
    ]);
    return await updateFileManifest(plan, writtenPaths, manifest, now);
  } catch (manifestErr) {
    console.warn(`  ⚠  Could not update manifest: ${(manifestErr as Error).message}`);
    return false;
  }
}

/** Saves the manifest to disk; swallows and warns on any failure. */
function trySaveManifest(projectDir: string, manifest: Manifest): void {
  try {
    saveManifest(projectDir, manifest);
  } catch (err) {
    console.warn(`  ⚠  Could not save manifest: ${(err as Error).message}`);
  }
}

/** Writes new files, applies overwrites, updates the manifest, installs config merges. */
export async function executeAddPlan(plan: AddPlan): Promise<AddOutcome> {
  const { opts, toWrite } = plan;

  const { overwrittenCount, conflictPaths } = writePlanFiles(plan);

  const manifest = loadManifest(opts.projectDir);
  const now = new Date().toISOString();

  const fileManifestDirty = await tryUpdateFileManifest(plan, {
    toWrite,
    conflictPaths,
    manifest,
    now,
  });
  const configResult = await installConfigArtifacts(plan, manifest, now);

  if (fileManifestDirty || configResult.manifestDirty) {
    trySaveManifest(opts.projectDir, manifest);
  }

  return { overwrittenCount, configWrittenCount: configResult.configWrittenCount };
}
