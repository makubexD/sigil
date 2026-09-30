/**
 * `sigil add` — config-kind (hook/settings/mcp) install phase, split out of execute.ts
 * because the config-artifact-writing loop is a substantial, self-contained concern
 * (JSON merge, home-directory backup, manifest recording) — mirrors the
 * import-report.ts / import-language.ts split out of import.ts.
 *
 * @module
 */
import fs from 'fs';
import path from 'path';
import { replaceMerge, serialize } from '../../config-merge';
import { resolveConfigRoot, isHomeScopedRoot, ensureHomeBackup } from '../../config-utils';
import { previousOpFor, upsertConfigEntry } from '../../manifest';
import { pkg } from '../../cli-helpers';
import type { ConfigMergeOp, ConfigRoot, ResolvedCatalog, Target } from '../../types';
import type { Manifest, ManifestEntry } from '../../manifest';
import type { AddPlan } from './plan';

export interface ConfigInstallOutcome {
  configWrittenCount: number;
  manifestDirty: boolean;
}

/** Reads the existing JSON at `fullPath`, or `{}` if absent; logs+skips on parse failure. */
function readExistingConfigJson(fullPath: string, id: string): Record<string, unknown> | undefined {
  if (!fs.existsSync(fullPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    console.error(
      `✗ Cannot install '${id}': ${fullPath} exists but is not valid JSON. Fix it first.`,
    );
    return undefined;
  }
}

/**
 * Applies one ConfigMergeOp to disk; returns true if a file was written. `previous` is the
 * fragment an earlier install of the same artifact recorded for this destination: it is reversed
 * first, so re-installing replaces sigil's fragment instead of stacking a second copy.
 */
function applyConfigMergeOp(
  op: ConfigMergeOp,
  previous: ConfigMergeOp | undefined,
  id: string,
  projectDir: string,
): boolean {
  const rootDir = resolveConfigRoot(op.root as ConfigRoot | undefined, projectDir);
  const fullPath = path.join(rootDir, op.file);
  const opSecSuffix = op.section ? `  › ${op.section}` : '';

  const existing = readExistingConfigJson(fullPath, id);
  if (existing === undefined) return false;

  if (isHomeScopedRoot(op.root as ConfigRoot | undefined)) {
    ensureHomeBackup(fullPath);
  }

  const merged = replaceMerge(existing, previous, op);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, serialize(merged), 'utf-8');
  console.log(`  ${fullPath}${opSecSuffix}  (merged: ${id})`);
  return true;
}

interface ConfigArtifactResult {
  written: number;
  /** True whenever `upsertConfigEntry` ran: at least one op was written, or an earlier
   * record still describes a file this install skipped. */
  upserted: boolean;
}

/**
 * Applies every ConfigMergeOp for one artifact. `toRecord` is what the manifest should now
 * describe: each written op, or — where a file was skipped (invalid JSON) — the fragment
 * recorded before, since that is still what the file holds.
 */
function applyAllConfigMergeOps(
  ops: ConfigMergeOp[],
  installed: ManifestEntry | undefined,
  id: string,
  projectDir: string,
): { written: number; toRecord: ConfigMergeOp[] } {
  const toRecord: ConfigMergeOp[] = [];
  let written = 0;
  for (const op of ops) {
    const previous = previousOpFor(installed, op);
    if (applyConfigMergeOp(op, previous, id, projectDir)) {
      written++;
      toRecord.push(op);
    } else if (previous) toRecord.push(previous);
  }
  return { written, toRecord };
}

/** Shared context threaded through the config-install helpers below. */
interface InstallCtx {
  resolved: ResolvedCatalog;
  target: Target;
  plan: AddPlan;
  manifest: Manifest;
  targetName: string;
  now: string;
}

/** Records one config artifact's ops into the manifest. */
function recordConfigEntry(id: string, kind: string, ops: ConfigMergeOp[], ctx: InstallCtx): void {
  upsertConfigEntry(ctx.manifest, {
    id,
    kind,
    target: ctx.targetName,
    ops,
    dependentOf: [],
    sigilVersion: pkg.version,
    now: ctx.now,
  });
}

/** Scaffolds + applies + records one config artifact's ops (no error handling — caller wraps). */
async function scaffoldAndApplyConfig(
  id: string,
  artifact: { kind: string },
  ctx: InstallCtx,
): Promise<ConfigArtifactResult> {
  const { target, resolved, plan } = ctx;
  const ops: ConfigMergeOp[] = await target.scaffoldConfig!(id, resolved, plan.scaffoldOpts);
  if (ops.length === 0) return { written: 0, upserted: false };

  const installed = ctx.manifest.entries.find(e => e.id === id && e.target === ctx.targetName);
  const applied = applyAllConfigMergeOps(ops, installed, id, plan.opts.projectDir);
  const { written, toRecord } = applied;
  if (toRecord.length === 0) return { written, upserted: false };
  recordConfigEntry(id, artifact.kind, toRecord, ctx);
  return { written, upserted: true };
}

/** Installs one config artifact's merge ops. */
async function installOneConfigArtifact(
  id: string,
  ctx: InstallCtx,
): Promise<ConfigArtifactResult> {
  const artifact = ctx.resolved.byId.get(id);
  if (!artifact) return { written: 0, upserted: false };
  try {
    return await scaffoldAndApplyConfig(id, artifact, ctx);
  } catch (err) {
    console.error(`✗ Failed to install config artifact '${id}': ${(err as Error).message}`);
    return { written: 0, upserted: false };
  }
}

/** Warns that the target does not support config-kind installs, for each unsupported id. */
function warnUnsupportedConfigKinds(
  configIds: string[],
  resolved: ResolvedCatalog,
  targetName: string,
): void {
  for (const id of configIds) {
    const a = resolved.byId.get(id);
    console.warn(
      `  ⚠  '${id}' (${a?.kind}) — target '${targetName}' does not support config-kind installs. Skipped.`,
    );
  }
}

/** Installs every config artifact in `configIds`, aggregating written-count + manifest-dirty. */
async function installAllConfigArtifacts(
  configIds: string[],
  ctx: InstallCtx,
): Promise<ConfigInstallOutcome> {
  let configWrittenCount = 0;
  let manifestDirty = false;
  for (const id of configIds) {
    const result = await installOneConfigArtifact(id, ctx);
    configWrittenCount += result.written;
    if (result.upserted) manifestDirty = true;
  }
  return { configWrittenCount, manifestDirty };
}

/** Installs all config-kind (hook/settings/mcp) artifacts in the plan. */
export async function installConfigArtifacts(
  plan: AddPlan,
  manifest: Manifest,
  now: string,
): Promise<ConfigInstallOutcome> {
  const { resolved, target, targetName, configIds } = plan;

  if (configIds.length === 0) return { configWrittenCount: 0, manifestDirty: false };

  if (!target.scaffoldConfig) {
    warnUnsupportedConfigKinds(configIds, resolved, targetName);
    return { configWrittenCount: 0, manifestDirty: false };
  }

  return installAllConfigArtifacts(configIds, {
    resolved,
    target,
    plan,
    manifest,
    targetName,
    now,
  });
}
