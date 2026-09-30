/**
 * `sigil add` command — business logic.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 * `cli.ts` keeps only the option declarations and wires `.action(runAdd)`.
 *
 * @module
 */

import fs from 'fs';
import path from 'path';
import { resolveCatalog } from '../resolve';
import { getTarget } from '../targets';
import { resolveSelection, CONFIG_KINDS } from '../select';
import { hasUsesClosure } from '../kinds';
import {
  isInteractiveTTY,
  runWizard,
  buildEquivalentCommand,
  printEquivalentCommand,
  printConflictAdvice,
  printSkippedAdvice,
} from '../wizard';
import { checkOutputContract } from '../targets/output-contract';
import { computeInstallStates } from '../install-state';
import { applyMerge, serialize } from '../config-merge';
import { resolveConfigRoot } from '../config-utils';
import { loadManifest, saveManifest, upsertEntries, upsertConfigEntry } from '../manifest';
import {
  loadAndValidate,
  writeFilesSync,
  partitionFiles,
  detectProjectTarget,
  mergeOpSection,
  pkg,
} from '../cli-helpers';
import type { FileMap, ConfigMergeOp, ConfigScope, ConfigRoot } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AddOpts {
  target?: string;
  projectDir: string;
  catalogDir: string;
  packs: string;
  kind?: string;
  exclude?: string;
  language?: string;
  /** Commander sets this to false when --no-deps is passed, true otherwise. */
  deps: boolean;
  dryRun: boolean;
  interactive: boolean;
  yes: boolean;
  overwrite: boolean;
  scope?: string;
  /** Deprecated alias for --scope local. */
  settingsLocal: boolean;
}

// ─── Command function ─────────────────────────────────────────────────────────

export async function runAdd(selectors: string[], opts: AddOpts): Promise<void> {
  const { catalog, packsConfig } = await loadAndValidate(opts.catalogDir, opts.packs);
  const resolved = resolveCatalog(catalog);

  // ── Wizard vs flags dispatch ───────────────────────────────────────────────
  const needsWizard = (selectors.length === 0 || opts.interactive) && !opts.yes;
  const isTTY = isInteractiveTTY();

  let effectiveSelectors = selectors;
  let effectiveTarget = opts.target;
  let effectiveIncludeDeps = opts.deps !== false;
  let effectiveOverwrite = opts.overwrite;
  let effectiveLanguage = opts.language;
  let effectiveScope: ConfigScope = opts.settingsLocal
    ? 'local'
    : ((opts.scope as ConfigScope | undefined) ?? 'project');

  if (needsWizard) {
    if (!isTTY) {
      console.error(
        '✗ No selectors provided and stdin/stdout is not an interactive terminal.\n' +
          '  Provide at least one selector (e.g. `add all` or `add skill:csharp/cs-generate-tests`)\n' +
          '  or use --yes to confirm non-interactive mode.\n\n' +
          '  Available selectors:\n' +
          '    all                         install the full catalog\n' +
          '    pack:<name>                 install a named pack\n' +
          '    kind:<kind>                 install all of a kind (skill/agent/rule/prompt)\n' +
          '    <kind>:<id>                 install a specific artifact\n\n' +
          '  Run `sigil list` to browse available artifacts.',
      );
      process.exit(1);
    }

    const detectedTarget = detectProjectTarget(opts.projectDir, { verbose: false });
    const wizardResult = await runWizard(
      resolved,
      packsConfig.packs,
      detectedTarget,
      opts.projectDir,
    );
    if (!wizardResult) return;

    effectiveSelectors = wizardResult.selectors;
    effectiveTarget = wizardResult.target;
    effectiveIncludeDeps = wizardResult.includeDeps;
    effectiveOverwrite = wizardResult.overwrite;
    effectiveLanguage = wizardResult.language ?? opts.language;
    if (wizardResult.configScope) effectiveScope = wizardResult.configScope as ConfigScope;
  }

  // ── Target resolution ──────────────────────────────────────────────────────
  const targetName = effectiveTarget ?? detectProjectTarget(opts.projectDir, { verbose: true });
  const target = getTarget(targetName);

  if (!target.scaffold) {
    console.error(`✗ Target '${targetName}' does not support the add command.`);
    process.exit(1);
  }

  // ── Selection + filtering ──────────────────────────────────────────────────
  const effectiveKinds = opts.kind
    ?.split(',')
    .map(k => k.trim())
    .filter(Boolean);
  const effectiveExclude = opts.exclude
    ?.split(',')
    .map(k => k.trim())
    .filter(Boolean);

  const filters = { kinds: effectiveKinds, exclude: effectiveExclude, language: effectiveLanguage };

  let ids: string[];
  let skipped: Array<{ id: string; kind: string; reason: string }>;

  try {
    const result = resolveSelection(
      effectiveSelectors,
      filters,
      resolved,
      packsConfig.packs,
      target.supportedKinds ?? [],
      targetName,
    );
    ids = result.ids;
    skipped = result.skipped;
  } catch (err) {
    console.error(`✗ ${(err as Error).message}`);
    process.exit(1);
  }

  printSkippedAdvice(skipped, target);

  if (ids.length === 0) {
    console.log('No artifacts to install (all were filtered out or unsupported).');
    return;
  }

  // ── Manifest-aware install-state detection ─────────────────────────────────
  let upToDateIds: string[] = [];
  if (!opts.dryRun) {
    try {
      const installStates = await computeInstallStates(
        ids,
        target,
        resolved,
        opts.projectDir,
        effectiveScope,
      );
      if (!effectiveOverwrite) {
        upToDateIds = ids.filter(id => installStates.get(id)?.state === 'up-to-date');
        if (upToDateIds.length > 0) {
          for (const id of upToDateIds) {
            console.log(`  =  ${id}  (✓ already up to date — skipped)`);
          }
        }
      }
    } catch {
      // State detection failed — proceed without skip logic (safe fallback)
    }
  }
  const upToDateSet = new Set(upToDateIds);

  // ── Split IDs: whole-file kinds vs config kinds ────────────────────────────
  const wholeFileIds = ids.filter(
    id => !CONFIG_KINDS.has(resolved.byId.get(id)?.kind ?? '') && !upToDateSet.has(id),
  );
  const configIds = ids.filter(
    id => CONFIG_KINDS.has(resolved.byId.get(id)?.kind ?? '') && !upToDateSet.has(id),
  );

  // ── Scaffold whole-file artifacts ──────────────────────────────────────────
  const scaffoldOpts = {
    projectDir: opts.projectDir,
    overwrite: effectiveOverwrite,
    includeDeps: effectiveIncludeDeps,
    scope: effectiveScope,
    coInstallSet: new Set(wholeFileIds),
  };

  // Pre-compute primary (no-dep) file paths for dep tagging in the summary listing.
  const primaryPaths = new Set<string>();
  if (effectiveIncludeDeps) {
    const primaryScaffoldOpts = { ...scaffoldOpts, includeDeps: false };
    for (const id of wholeFileIds) {
      try {
        const pFiles = await target.scaffold!(id, resolved, primaryScaffoldOpts);
        for (const k of Object.keys(pFiles)) primaryPaths.add(k);
      } catch {
        /* ignore — the main loop below will surface real errors */
      }
    }
  }

  const allFiles: FileMap = {};
  for (const id of wholeFileIds) {
    try {
      const files = await target.scaffold!(id, resolved, scaffoldOpts);
      Object.assign(allFiles, files);
    } catch (err) {
      console.error(`✗ Failed to scaffold '${id}': ${(err as Error).message}`);
      process.exit(1);
    }
  }

  // ── Output-conformance check ───────────────────────────────────────────────
  const violations = checkOutputContract(allFiles, target.outputContracts ?? []);
  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`  ✗  [${v.label}] ${v.file}`);
      console.error(`       ${v.problem}`);
    }
    console.error(
      `\n✗ ${violations.length} output-conformance error(s). Install aborted — no files were written.`,
    );
    process.exit(1);
  }

  // ── Conflict detection ─────────────────────────────────────────────────────
  const { toWrite, conflicting } = partitionFiles(allFiles, opts.projectDir);

  // ── Dry-run preview ────────────────────────────────────────────────────────
  if (opts.dryRun) {
    await printDryRunSummary(
      toWrite,
      conflicting,
      configIds,
      target,
      resolved,
      scaffoldOpts,
      opts.projectDir,
    );
    return;
  }

  // ── Write new files ────────────────────────────────────────────────────────
  writeFilesSync(toWrite, opts.projectDir);

  // ── Handle conflicts ───────────────────────────────────────────────────────
  let overwrittenCount = 0;
  const conflictPaths = Object.keys(conflicting);

  if (conflictPaths.length > 0) {
    if (effectiveOverwrite) {
      writeFilesSync(conflicting, opts.projectDir);
      overwrittenCount = conflictPaths.length;
    } else {
      printConflictAdvice(conflictPaths);
    }
  }

  // ── Write manifest (whole-file kinds) ─────────────────────────────────────
  const manifest = loadManifest(opts.projectDir);
  let manifestDirty = false;
  const now = new Date().toISOString();

  try {
    const writtenPaths = new Set([
      ...Object.keys(toWrite),
      ...(effectiveOverwrite ? conflictPaths : []),
    ]);

    if (writtenPaths.size > 0) {
      const filesByArtifact = new Map<string, { relPaths: string[]; kind: string }>();

      // Primary picks: scaffold without deps to isolate primary file paths.
      for (const id of wholeFileIds) {
        const a = resolved.byId.get(id);
        if (!a) continue;
        const primaryOnly = await target.scaffold!(id, resolved, {
          ...scaffoldOpts,
          includeDeps: false,
        });
        const relPaths = Object.keys(primaryOnly).filter(p => writtenPaths.has(p));
        if (relPaths.length > 0) {
          filesByArtifact.set(id, { relPaths, kind: a.kind });
        }
      }

      // Dependency files: map dep-id → parent primary IDs.
      const depMap = new Map<string, string[]>();
      if (effectiveIncludeDeps) {
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
            ...scaffoldOpts,
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

  // ── Install config kinds (hook / settings / mcp) ───────────────────────────
  let configWrittenCount = 0;
  if (configIds.length > 0 && target.scaffoldConfig) {
    for (const id of configIds) {
      const artifact = resolved.byId.get(id);
      if (!artifact) continue;
      try {
        const ops: ConfigMergeOp[] = await target.scaffoldConfig(id, resolved, scaffoldOpts);
        if (ops.length === 0) continue;

        for (const op of ops) {
          const rootDir = resolveConfigRoot(op.root as ConfigRoot | undefined, opts.projectDir);
          const fullPath = path.join(rootDir, op.file);
          const isHomeWrite = op.root === 'home' || op.root === 'vscode-user';
          const opSec = mergeOpSection(op.fragment, artifact.kind);
          const opSecSuffix = opSec ? `  › ${opSec}` : '';

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

  // ── Persist manifest ───────────────────────────────────────────────────────
  if (manifestDirty) {
    try {
      saveManifest(opts.projectDir, manifest);
    } catch (err) {
      console.warn(`  ⚠  Could not save manifest: ${(err as Error).message}`);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const written = Object.keys(toWrite).length + overwrittenCount;
  const skippedConflict = effectiveOverwrite ? 0 : conflictPaths.length;

  console.log(
    `\n✓ ${written + configWrittenCount} operation(s) applied to ${opts.projectDir}` +
      (configWrittenCount > 0 ? ` (${configWrittenCount} JSON merge(s))` : '') +
      (upToDateIds.length > 0 ? `, ${upToDateIds.length} already up to date (skipped)` : '') +
      (skippedConflict > 0 ? `, ${skippedConflict} skipped (conflicts)` : '') +
      (skipped.length > 0
        ? `, ${skipped.length} artifact(s) not supported by '${targetName}'`
        : ''),
  );

  if (written > 0) {
    const isDep = (f: string) => primaryPaths.size > 0 && !primaryPaths.has(f);
    for (const f of Object.keys(toWrite)) {
      console.log(`  ${f}${isDep(f) ? '  (dependency)' : ''}`);
    }
    if (overwrittenCount > 0) {
      for (const f of conflictPaths) {
        console.log(`  ${f}  (overwritten)${isDep(f) ? '  (dependency)' : ''}`);
      }
    }
    const depCount = [
      ...Object.keys(toWrite),
      ...(overwrittenCount > 0 ? conflictPaths : []),
    ].filter(isDep).length;
    if (depCount > 0) {
      console.log(
        `\n  (${depCount} dependency file${depCount !== 1 ? 's' : ''} pulled in via uses: references` +
          ` — re-run with --no-deps to install selected artifacts only)`,
      );
    }
  }

  printEquivalentCommand(
    buildEquivalentCommand({
      selectors: effectiveSelectors,
      target: targetName,
      language: effectiveLanguage,
      kinds: effectiveKinds,
      exclude: effectiveExclude,
      includeDeps: effectiveIncludeDeps,
      overwrite: effectiveOverwrite,
      configScope: effectiveScope,
      hasConfigKinds: configIds.length > 0,
    }),
    isInteractiveTTY(),
  );
}

// ─── Dry-run preview ──────────────────────────────────────────────────────────

type ScaffoldOpts = {
  projectDir: string;
  overwrite: boolean;
  includeDeps: boolean;
  scope: ConfigScope;
  coInstallSet: Set<string>;
};

async function printDryRunSummary(
  toWrite: FileMap,
  conflicting: FileMap,
  configIds: string[],
  target: ReturnType<typeof getTarget>,
  resolved: ReturnType<typeof resolveCatalog>,
  scaffoldOpts: ScaffoldOpts,
  projectDir: string,
): Promise<void> {
  console.log('\nDry run — files that would be written:');
  const toWritePaths = Object.keys(toWrite);
  const conflictPaths = Object.keys(conflicting);
  for (const f of toWritePaths) console.log(`  + ${f}`);
  for (const f of conflictPaths) {
    console.log(`  ~ ${f}  (exists — would be overwritten with --overwrite)`);
  }
  console.log(
    `\n${toWritePaths.length} new, ${conflictPaths.length} conflict(s). No files were written.`,
  );

  if (configIds.length > 0 && target.scaffoldConfig) {
    console.log('\nConfig merges that would be applied:');
    for (const id of configIds) {
      const artifact = resolved.byId.get(id);
      if (!artifact) continue;
      const ops = await target.scaffoldConfig(id, resolved, scaffoldOpts).catch(() => []);
      for (const op of ops) {
        const rootDir = resolveConfigRoot(op.root as ConfigRoot | undefined, projectDir);
        const fullPath = path.join(rootDir, op.file);
        const sec = mergeOpSection(op.fragment, artifact.kind);
        const secSuffix = sec ? `  › ${sec}` : '';
        console.log(`  ~ ${fullPath}${secSuffix}  (config merge — ${artifact.kind})`);
      }
    }
  }
}
