/**
 * `sigil add` — execute phase: writes files, updates the manifest, and installs
 * config-kind (hook/settings/mcp) merges. Only ever called for a real (non-dry-run)
 * install — dry-run renders the same `AddPlan` instead (see render.ts).
 *
 * @module
 */
import fs from 'fs';
import path from 'path';
import { hasUsesClosure } from '../../kinds';
import { applyMerge, serialize } from '../../config-merge';
import { resolveConfigRoot } from '../../config-utils';
import { loadManifest, saveManifest, upsertEntries, upsertConfigEntry } from '../../manifest';
import { writeFilesSync, pkg } from '../../cli-helpers';
import { printConflictAdvice } from '../../wizard';
import type { ConfigMergeOp, ConfigRoot } from '../../types';
import type { AddPlan } from './plan';

export interface AddOutcome {
  overwrittenCount: number;
  configWrittenCount: number;
}

/** Writes new files, applies overwrites, updates the manifest, installs config merges. */
export async function executeAddPlan(plan: AddPlan): Promise<AddOutcome> {
  const { opts, resolved, target, targetName, toWrite, conflicting, wholeFileIds, configIds } =
    plan;

  writeFilesSync(toWrite, opts.projectDir);

  let overwrittenCount = 0;
  const conflictPaths = Object.keys(conflicting);
  if (conflictPaths.length > 0) {
    if (plan.effectiveOverwrite) {
      writeFilesSync(conflicting, opts.projectDir);
      overwrittenCount = conflictPaths.length;
    } else {
      printConflictAdvice(conflictPaths);
    }
  }

  const manifest = loadManifest(opts.projectDir);
  let manifestDirty = false;
  const now = new Date().toISOString();

  try {
    const writtenPaths = new Set([
      ...Object.keys(toWrite),
      ...(plan.effectiveOverwrite ? conflictPaths : []),
    ]);

    if (writtenPaths.size > 0) {
      const filesByArtifact = new Map<string, { relPaths: string[]; kind: string }>();

      // Primary picks: scaffold without deps to isolate primary file paths.
      for (const id of wholeFileIds) {
        const a = resolved.byId.get(id);
        if (!a) continue;
        const primaryOnly = await target.scaffold!(id, resolved, {
          ...plan.scaffoldOpts,
          includeDeps: false,
        });
        const relPaths = Object.keys(primaryOnly).filter(p => writtenPaths.has(p));
        if (relPaths.length > 0) {
          filesByArtifact.set(id, { relPaths, kind: a.kind });
        }
      }

      // Dependency files: map dep-id → parent primary IDs.
      const depMap = new Map<string, string[]>();
      if (plan.effectiveIncludeDeps) {
        for (const id of wholeFileIds) {
          const a = resolved.byId.get(id);
          if (!a || !hasUsesClosure(a.kind)) continue;
          for (const rule of a.resolvedRules ?? []) {
            if (!wholeFileIds.includes(rule.id)) {
              const existing = depMap.get(rule.id) ?? [];
              existing.push(id);
              depMap.set(rule.id, existing);
            }
          }
          for (const agentId of a.resolvedAgentIds ?? []) {
            if (!wholeFileIds.includes(agentId)) {
              const existing = depMap.get(agentId) ?? [];
              existing.push(id);
              depMap.set(agentId, existing);
            }
          }
        }
        for (const depId of depMap.keys()) {
          const depArtifact = resolved.byId.get(depId);
          if (!depArtifact) continue;
          const depScaffold = await target.scaffold!(depId, resolved, {
            ...plan.scaffoldOpts,
            includeDeps: false,
          });
          const relPaths = Object.keys(depScaffold).filter(p => writtenPaths.has(p));
          if (relPaths.length > 0) {
            filesByArtifact.set(depId, { relPaths, kind: depArtifact.kind });
          }
        }
      }

      if (filesByArtifact.size > 0) {
        upsertEntries(
          manifest,
          targetName,
          wholeFileIds,
          depMap,
          filesByArtifact,
          opts.projectDir,
          pkg.version,
          now,
        );
        manifestDirty = true;
      }
    }
  } catch (manifestErr) {
    console.warn(`  ⚠  Could not update manifest: ${(manifestErr as Error).message}`);
  }

  let configWrittenCount = 0;
  if (configIds.length > 0 && target.scaffoldConfig) {
    for (const id of configIds) {
      const artifact = resolved.byId.get(id);
      if (!artifact) continue;
      try {
        const ops: ConfigMergeOp[] = await target.scaffoldConfig(id, resolved, plan.scaffoldOpts);
        if (ops.length === 0) continue;

        for (const op of ops) {
          const rootDir = resolveConfigRoot(op.root as ConfigRoot | undefined, opts.projectDir);
          const fullPath = path.join(rootDir, op.file);
          const isHomeWrite = op.root === 'home' || op.root === 'vscode-user';
          const opSecSuffix = op.section ? `  › ${op.section}` : '';

          let existing: Record<string, unknown> = {};
          if (fs.existsSync(fullPath)) {
            try {
              existing = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as Record<string, unknown>;
            } catch {
              console.error(
                `✗ Cannot install '${id}': ${op.file} exists but is not valid JSON. Fix it first.`,
              );
              continue;
            }
          }

          if (isHomeWrite && fs.existsSync(fullPath)) {
            const bakPath = `${fullPath}.sigil.bak`;
            if (!fs.existsSync(bakPath)) {
              fs.copyFileSync(fullPath, bakPath);
              console.warn(`\n  ⚠  Writing to ${fullPath} — this file affects ALL your projects.`);
              console.warn(`  ⚠  Backup saved → ${bakPath}`);
              console.warn(
                `  ⚠  Review the diff before committing: diff "${bakPath}" "${fullPath}"\n`,
              );
            } else {
              console.warn(`  ⚠  Existing backup kept → ${bakPath}  (compare before committing)`);
            }
          }

          const merged = applyMerge(existing, op);
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.writeFileSync(fullPath, serialize(merged), 'utf-8');
          configWrittenCount++;
          console.log(`  ${fullPath}${opSecSuffix}  (merged: ${id})`);
        }

        upsertConfigEntry(manifest, id, artifact.kind, targetName, ops, [], pkg.version, now);
        manifestDirty = true;
      } catch (err) {
        console.error(`✗ Failed to install config artifact '${id}': ${(err as Error).message}`);
      }
    }
  } else if (configIds.length > 0) {
    for (const id of configIds) {
      const a = resolved.byId.get(id);
      console.warn(
        `  ⚠  '${id}' (${a?.kind}) — target '${targetName}' does not support config-kind installs. Skipped.`,
      );
    }
  }

  if (manifestDirty) {
    try {
      saveManifest(opts.projectDir, manifest);
    } catch (err) {
      console.warn(`  ⚠  Could not save manifest: ${(err as Error).message}`);
    }
  }

  return { overwrittenCount, configWrittenCount };
}
