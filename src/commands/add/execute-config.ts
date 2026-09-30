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
import { applyMerge, serialize } from '../../config-merge';
import { resolveConfigRoot } from '../../config-utils';
import { upsertConfigEntry } from '../../manifest';
import { pkg } from '../../cli-helpers';
import type { ConfigMergeOp, ConfigRoot, ResolvedCatalog, Target } from '../../types';
import type { Manifest } from '../../manifest';
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

/** Writes a pristine `.sigil.bak` before the first home-directory write; warns either way. */
function ensureHomeBackup(fullPath: string): void {
  const bakPath = `${fullPath}.sigil.bak`;
  if (!fs.existsSync(bakPath)) {
    fs.copyFileSync(fullPath, bakPath);
    console.warn(`\n  ⚠  Writing to ${fullPath} — this file affects ALL your projects.`);
    console.warn(`  ⚠  Backup saved → ${bakPath}`);
    console.warn(`  ⚠  Review the diff before committing: diff "${bakPath}" "${fullPath}"\n`);
  } else {
    console.warn(`  ⚠  Existing backup kept → ${bakPath}  (compare before committing)`);
  }
}

/** Applies one ConfigMergeOp to disk; returns true if a file was written. */
function applyConfigMergeOp(op: ConfigMergeOp, id: string, projectDir: string): boolean {
  const rootDir = resolveConfigRoot(op.root as ConfigRoot | undefined, projectDir);
  const fullPath = path.join(rootDir, op.file);
  const isHomeWrite = op.root === 'home' || op.root === 'vscode-user';
  const opSecSuffix = op.section ? `  › ${op.section}` : '';

  const existing = readExistingConfigJson(fullPath, id);
  if (existing === undefined) return false;

  if (isHomeWrite && fs.existsSync(fullPath)) {
    ensureHomeBackup(fullPath);
  }

  const merged = applyMerge(existing, op);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, serialize(merged), 'utf-8');
  console.log(`  ${fullPath}${opSecSuffix}  (merged: ${id})`);
  return true;
}

interface ConfigArtifactResult {
  written: number;
  /** True whenever `upsertConfigEntry` ran — mirrors the original's unconditional call
   * once `ops.length > 0`, independent of how many individual ops actually wrote a file. */
  upserted: boolean;
}

/** Applies every ConfigMergeOp for one artifact; returns how many actually wrote a file. */
function applyAllConfigMergeOps(ops: ConfigMergeOp[], id: string, projectDir: string): number {
  let written = 0;
  for (const op of ops) {
    if (applyConfigMergeOp(op, id, projectDir)) written++;
  }
  return written;
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
  const ops: ConfigMergeOp[] = await ctx.target.scaffoldConfig!(
    id,
    ctx.resolved,
    ctx.plan.scaffoldOpts,
  );
  if (ops.length === 0) return { written: 0, upserted: false };

  const written = applyAllConfigMergeOps(ops, id, ctx.plan.opts.projectDir);
  recordConfigEntry(id, artifact.kind, ops, ctx);
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
