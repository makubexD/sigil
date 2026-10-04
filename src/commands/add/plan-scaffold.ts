/**
 * `sigil add` — whole-file scaffolding: primary-path pre-computation, the main
 * scaffold loop, and output-conformance checking. Split out of plan.ts to keep
 * that file under the repo's own module-size threshold.
 *
 * @module
 */
import { SigilError } from '../../errors';
import { checkOutputContract } from '../../targets/output-contract';
import { contractsFor } from '../../targets/all-emit-specs';
import { partitionFiles } from '../../cli-helpers';
import { renderViolations } from '../shared/contract';
import type { FileMap } from '../../types';
import type { PlanCtx } from './plan-context';
import type { ScaffoldOpts } from './plan';

/** Pre-computes primary (no-dep) file paths for dep tagging in the summary listing. */
export async function computePrimaryPaths(
  ctx: PlanCtx,
  wholeFileIds: string[],
  scaffoldOpts: ScaffoldOpts,
): Promise<Set<string>> {
  const primaryPaths = new Set<string>();
  if (!ctx.inputs.includeDeps) return primaryPaths;

  const primaryScaffoldOpts = { ...scaffoldOpts, includeDeps: false };
  for (const id of wholeFileIds) {
    try {
      const pFiles = await ctx.target.scaffold!(id, ctx.resolved, primaryScaffoldOpts);
      for (const k of Object.keys(pFiles)) primaryPaths.add(k);
    } catch {
      /* ignore — the main scaffold loop below will surface real errors */
    }
  }
  return primaryPaths;
}

/** Scaffolds every whole-file id into a single merged FileMap. */
async function scaffoldAllIds(
  ctx: PlanCtx,
  wholeFileIds: string[],
  scaffoldOpts: ScaffoldOpts,
): Promise<FileMap> {
  const allFiles: FileMap = {};
  for (const id of wholeFileIds) {
    try {
      const files = await ctx.target.scaffold!(id, ctx.resolved, scaffoldOpts);
      Object.assign(allFiles, files);
    } catch (err) {
      throw new SigilError(`Failed to scaffold '${id}': ${(err as Error).message}`, { cause: err });
    }
  }
  return allFiles;
}

/** Throws when the scaffolded files fail the target's output contract. */
function assertOutputContract(ctx: PlanCtx, allFiles: FileMap): void {
  const violations = checkOutputContract(allFiles, contractsFor(ctx.target));
  if (violations.length > 0) {
    throw new SigilError(
      `${violations.length} output-conformance error(s). Install aborted — no files were written.`,
      { hint: renderViolations(violations) },
    );
  }
}

/** Scaffolds every whole-file id, checks output conformance, and partitions new-vs-conflicting. */
export async function scaffoldWholeFiles(
  ctx: PlanCtx,
  wholeFileIds: string[],
  scaffoldOpts: ScaffoldOpts,
): Promise<{ toWrite: FileMap; conflicting: FileMap }> {
  const allFiles = await scaffoldAllIds(ctx, wholeFileIds, scaffoldOpts);
  assertOutputContract(ctx, allFiles);
  return partitionFiles(allFiles, ctx.opts.projectDir);
}
