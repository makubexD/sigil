/**
 * `sigil add` — render phase: dry-run preview and the final install summary.
 * Both read from the same `AddPlan` the real execution used, so preview and
 * reality can't drift apart. `printDryRunSummary`'s old 7 positional params
 * collapse to one (`plan`).
 *
 * @module
 */
import path from 'path';
import { resolveConfigRoot } from '../../config-utils';
import { buildEquivalentCommand, printEquivalentCommand, isInteractiveTTY } from '../../wizard';
import type { ConfigRoot } from '../../types';
import type { AddPlan } from './plan';
import type { AddOutcome } from './execute';

/** Prints the dry-run preview: files that would be written + config merges that would apply. */
export async function renderDryRun(plan: AddPlan): Promise<void> {
  console.log('\nDry run — files that would be written:');
  const toWritePaths = Object.keys(plan.toWrite);
  const conflictPaths = Object.keys(plan.conflicting);
  for (const f of toWritePaths) console.log(`  + ${f}`);
  for (const f of conflictPaths) {
    console.log(`  ~ ${f}  (exists — would be overwritten with --overwrite)`);
  }
  console.log(
    `\n${toWritePaths.length} new, ${conflictPaths.length} conflict(s). No files were written.`,
  );

  if (plan.configIds.length > 0 && plan.target.scaffoldConfig) {
    console.log('\nConfig merges that would be applied:');
    for (const id of plan.configIds) {
      const artifact = plan.resolved.byId.get(id);
      if (!artifact) continue;
      const ops = await plan.target
        .scaffoldConfig(id, plan.resolved, plan.scaffoldOpts)
        .catch(() => []);
      for (const op of ops) {
        const rootDir = resolveConfigRoot(op.root as ConfigRoot | undefined, plan.opts.projectDir);
        const fullPath = path.join(rootDir, op.file);
        const secSuffix = op.section ? `  › ${op.section}` : '';
        console.log(`  ~ ${fullPath}${secSuffix}  (config merge — ${artifact.kind})`);
      }
    }
  }
}

/** Prints the final summary after a real install: counts, per-file listing, equivalent command. */
export function renderOutcome(plan: AddPlan, outcome: AddOutcome): void {
  const written = Object.keys(plan.toWrite).length + outcome.overwrittenCount;
  const conflictPaths = Object.keys(plan.conflicting);
  const skippedConflict = plan.effectiveOverwrite ? 0 : conflictPaths.length;

  console.log(
    `\n✓ ${written + outcome.configWrittenCount} operation(s) applied to ${plan.opts.projectDir}` +
      (outcome.configWrittenCount > 0 ? ` (${outcome.configWrittenCount} JSON merge(s))` : '') +
      (plan.upToDateIds.length > 0
        ? `, ${plan.upToDateIds.length} already up to date (skipped)`
        : '') +
      (skippedConflict > 0 ? `, ${skippedConflict} skipped (conflicts)` : '') +
      (plan.skipped.length > 0
        ? `, ${plan.skipped.length} artifact(s) not supported by '${plan.targetName}'`
        : ''),
  );

  if (written > 0) {
    const isDep = (f: string) => plan.primaryPaths.size > 0 && !plan.primaryPaths.has(f);
    for (const f of Object.keys(plan.toWrite)) {
      console.log(`  ${f}${isDep(f) ? '  (dependency)' : ''}`);
    }
    if (outcome.overwrittenCount > 0) {
      for (const f of conflictPaths) {
        console.log(`  ${f}  (overwritten)${isDep(f) ? '  (dependency)' : ''}`);
      }
    }
    const depCount = [
      ...Object.keys(plan.toWrite),
      ...(outcome.overwrittenCount > 0 ? conflictPaths : []),
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
      selectors: plan.effectiveSelectors,
      target: plan.targetName,
      language: plan.effectiveLanguage,
      kinds: plan.effectiveKinds,
      exclude: plan.effectiveExclude,
      includeDeps: plan.effectiveIncludeDeps,
      overwrite: plan.effectiveOverwrite,
      configScope: plan.effectiveScope,
      hasConfigKinds: plan.configIds.length > 0,
    }),
    isInteractiveTTY(),
  );
}
