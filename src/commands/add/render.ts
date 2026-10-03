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

/** Prints the "files that would be written" section and returns the new/conflict path lists. */
function printDryRunFiles(plan: AddPlan): { toWritePaths: string[]; conflictPaths: string[] } {
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
  return { toWritePaths, conflictPaths };
}

/** Prints the config-merge ops that one config-kind artifact would apply in a dry run. */
async function printConfigMergePreview(id: string, plan: AddPlan): Promise<void> {
  const artifact = plan.resolved.byId.get(id);
  if (!artifact) return;
  const ops = await plan.target.scaffoldConfig!(id, plan.resolved, plan.scaffoldOpts).catch(
    () => [],
  );
  for (const op of ops) {
    const rootDir = resolveConfigRoot(op.root as ConfigRoot | undefined, plan.opts.projectDir);
    const fullPath = path.join(rootDir, op.file);
    const secSuffix = op.section ? `  › ${op.section}` : '';
    console.log(`  ~ ${fullPath}${secSuffix}  (config merge — ${artifact.kind})`);
  }
}

/** Prints the dry-run preview: files that would be written + config merges that would apply. */
export async function renderDryRun(plan: AddPlan): Promise<void> {
  printDryRunFiles(plan);

  if (plan.configIds.length > 0 && plan.target.scaffoldConfig) {
    console.log('\nConfig merges that would be applied:');
    for (const id of plan.configIds) {
      await printConfigMergePreview(id, plan);
    }
  }
}

/** Builds the "N operation(s) applied…" summary line. */
function buildOutcomeSummaryLine(plan: AddPlan, outcome: AddOutcome, written: number): string {
  const conflictCount = Object.keys(plan.conflicting).length;
  const skippedConflict = plan.effectiveOverwrite ? 0 : conflictCount;
  return (
    `\n✓ ${written + outcome.configWrittenCount} operation(s) applied to ${plan.opts.projectDir}` +
    (outcome.configWrittenCount > 0 ? ` (${outcome.configWrittenCount} JSON merge(s))` : '') +
    (plan.upToDateIds.length > 0
      ? `, ${plan.upToDateIds.length} already up to date (skipped)`
      : '') +
    (skippedConflict > 0 ? `, ${skippedConflict} skipped (conflicts)` : '') +
    skippedSummary(plan)
  );
}

/** ", N already included in another artifact" and ", N artifact(s) not supported by 'x'", when non-zero. */
export function skippedSummary(plan: AddPlan): string {
  const included = plan.skipped.filter(x => x.cause === 'inlined').length;
  const unsupported = plan.skipped.length - included;
  return (
    (unsupported > 0 ? `, ${unsupported} artifact(s) not supported by '${plan.targetName}'` : '') +
    (included > 0 ? `, ${included} already included in another artifact` : '')
  );
}

/** Prints the "(N dependency files pulled in via uses: references…)" footnote, if any. */
function printDependencyFootnote(depCount: number): void {
  if (depCount === 0) return;
  console.log(
    `\n  (${depCount} dependency file${depCount !== 1 ? 's' : ''} pulled in via uses: references` +
      ` — re-run with --no-deps to install selected artifacts only)`,
  );
}

/** Prints the per-file listing (new + overwritten) and the dependency-count footnote. */
function printWrittenFileListing(plan: AddPlan, outcome: AddOutcome): void {
  const conflictPaths = Object.keys(plan.conflicting);
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
  for (const line of outcome.merged) console.log(`  ${line}`);
  printDependencyFootnote(depCount);
}

/** `<kind>:<id>` selectors that name an artifact already delivered inside another pick. */
function inlinedSelectors(plan: AddPlan): Set<string> {
  return new Set(plan.skipped.filter(s => s.cause === 'inlined').map(s => `${s.kind}:${s.id}`));
}

/** Prints the equivalent non-interactive `sigil add …` command for this outcome. */
function printOutcomeEquivalentCommand(plan: AddPlan): void {
  const inlined = inlinedSelectors(plan);
  printEquivalentCommand(
    buildEquivalentCommand({
      selectors: plan.effectiveSelectors.filter(sel => !inlined.has(sel)),
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

/** Tells the user what to do so the tool picks up what was just written. */
function printNextSteps(plan: AddPlan, outcome: AddOutcome, written: number): void {
  const hint = plan.target.afterInstallHint;
  if (hint && written + outcome.configWrittenCount > 0) console.log(`\nNext: ${hint}`);
}

/** Prints the final summary after a real install: counts, per-file listing, equivalent command. */
export function renderOutcome(plan: AddPlan, outcome: AddOutcome): void {
  const written = Object.keys(plan.toWrite).length + outcome.overwrittenCount;
  console.log(buildOutcomeSummaryLine(plan, outcome, written));

  if (written > 0 || outcome.merged.length > 0) printWrittenFileListing(plan, outcome);
  printNextSteps(plan, outcome, written);
  if (plan.fromWizard) printOutcomeEquivalentCommand(plan);
}
