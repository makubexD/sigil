/**
 * `sigil add` — plan phase: everything through conflict detection.
 *
 * Pure with respect to the *catalog* (no writes) but does touch the filesystem
 * read-only (install-state detection, `partitionFiles` existence checks) and can
 * prompt interactively (the wizard). Both dry-run and a real install build the
 * exact same `AddPlan` — dry-run just renders it instead of calling `executeAddPlan`.
 *
 * @module
 */
import { resolveCatalog } from '../../resolve';
import { getTarget } from '../../targets';
import { CONFIG_KINDS, type SkippedArtifact } from '../../select';
import { SigilError } from '../../errors';
import { printSkippedAdvice } from '../../wizard';
import { loadAndValidate, detectProjectTarget } from '../../cli-helpers';
import { resolveInputs } from './resolve-inputs';
import { resolveIds, computeUpToDateIds } from './plan-ids';
import { computePrimaryPaths, scaffoldWholeFiles } from './plan-scaffold';
import type { PlanCtx } from './plan-context';
import { coInstallSetFor } from './co-install';
import type { FileMap, ConfigScope, ResolvedCatalog, Target } from '../../types';
import type { AddOpts } from './index';

export interface ScaffoldOpts {
  projectDir: string;
  overwrite: boolean;
  includeDeps: boolean;
  scope: ConfigScope;
  coInstallSet: Set<string>;
}

export interface AddPlan {
  readonly opts: AddOpts;
  readonly resolved: ResolvedCatalog;
  readonly target: Target;
  readonly targetName: string;
  readonly effectiveSelectors: string[];
  readonly effectiveLanguage: string | undefined;
  readonly effectiveKinds: string[] | undefined;
  readonly effectiveExclude: string[] | undefined;
  readonly effectiveIncludeDeps: boolean;
  readonly effectiveOverwrite: boolean;
  readonly effectiveScope: ConfigScope;
  readonly skipped: SkippedArtifact[];
  readonly upToDateIds: string[];
  readonly wholeFileIds: string[];
  readonly configIds: string[];
  readonly scaffoldOpts: ScaffoldOpts;
  readonly primaryPaths: Set<string>;
  readonly toWrite: FileMap;
  readonly conflicting: FileMap;
}

/** Resolves the target adapter for this install, throwing if it can't scaffold. */
function resolveScaffoldTarget(targetName: string): Target {
  const target = getTarget(targetName);
  if (!target.scaffold) {
    throw new SigilError(`Target '${targetName}' does not support the add command.`);
  }
  return target;
}

/** Splits a comma-separated CLI flag into a trimmed, non-empty list, or undefined when unset. */
function splitCommaFlag(raw: string | undefined): string[] | undefined {
  return raw
    ?.split(',')
    .map(k => k.trim())
    .filter(Boolean);
}

/** Builds the plan context, resolving inputs/target; returns null when the wizard was cancelled. */
async function buildPlanCtx(selectors: string[], opts: AddOpts): Promise<PlanCtx | null> {
  const { catalog, packsConfig } = await loadAndValidate(opts.catalogDir, opts.packs);
  const resolved = resolveCatalog(catalog);

  const inputs = await resolveInputs(selectors, opts, resolved, packsConfig.packs);
  if (!inputs) return null;

  const targetName = inputs.target ?? detectProjectTarget(opts.projectDir, { verbose: true });
  const target = resolveScaffoldTarget(targetName);

  return { opts, resolved, target, targetName, inputs, packs: packsConfig.packs };
}

/** Splits resolved ids into whole-file vs config-kind, excluding already-up-to-date ids from both. */
function partitionIdsByKind(
  ids: string[],
  resolved: ResolvedCatalog,
  upToDateSet: Set<string>,
): { wholeFileIds: string[]; configIds: string[] } {
  const wholeFileIds = ids.filter(
    id => !CONFIG_KINDS.has(resolved.byId.get(id)?.kind ?? '') && !upToDateSet.has(id),
  );
  const configIds = ids.filter(
    id => CONFIG_KINDS.has(resolved.byId.get(id)?.kind ?? '') && !upToDateSet.has(id),
  );
  return { wholeFileIds, configIds };
}

/** Resolves candidate ids, prints skip advice, and splits them into whole-file vs config-kind. */
async function resolveAndPartitionIds(
  ctx: PlanCtx,
  filters: Parameters<typeof resolveIds>[1],
): Promise<{
  skipped: SkippedArtifact[];
  upToDateIds: string[];
  wholeFileIds: string[];
  configIds: string[];
}> {
  const { ids, skipped } = resolveIds(ctx, filters);
  printSkippedAdvice(skipped, ctx.target);

  const upToDateIds = await computeUpToDateIds(ctx, ids);
  const { wholeFileIds, configIds } = partitionIdsByKind(ids, ctx.resolved, new Set(upToDateIds));

  return { skipped, upToDateIds, wholeFileIds, configIds };
}

type EffectiveFields = Pick<
  AddPlan,
  | 'effectiveSelectors'
  | 'effectiveLanguage'
  | 'effectiveKinds'
  | 'effectiveExclude'
  | 'effectiveIncludeDeps'
  | 'effectiveOverwrite'
  | 'effectiveScope'
>;

/** Builds the "effective*" fields (echoing the resolved wizard/CLI inputs) of the AddPlan. */
function buildEffectiveFields(
  ctx: PlanCtx,
  effective: { kinds: string[] | undefined; exclude: string[] | undefined },
): EffectiveFields {
  return {
    effectiveSelectors: ctx.inputs.selectors,
    effectiveLanguage: ctx.inputs.language,
    effectiveKinds: effective.kinds,
    effectiveExclude: effective.exclude,
    effectiveIncludeDeps: ctx.inputs.includeDeps,
    effectiveOverwrite: ctx.inputs.overwrite,
    effectiveScope: ctx.inputs.scope,
  };
}

/** Parameters for {@link assembleAddPlan} beyond the shared PlanCtx. */
interface AssembleAddPlanOptions {
  effective: { kinds: string[] | undefined; exclude: string[] | undefined };
  partition: Awaited<ReturnType<typeof resolveAndPartitionIds>>;
  scaffoldOpts: ScaffoldOpts;
  files: { primaryPaths: Set<string>; toWrite: FileMap; conflicting: FileMap };
}

/** Assembles the final AddPlan from the context and every computed intermediate value. */
function assembleAddPlan(ctx: PlanCtx, options: AssembleAddPlanOptions): AddPlan {
  const { effective, partition, scaffoldOpts, files } = options;
  return {
    opts: ctx.opts,
    resolved: ctx.resolved,
    target: ctx.target,
    targetName: ctx.targetName,
    ...buildEffectiveFields(ctx, effective),
    ...partition,
    scaffoldOpts,
    ...files,
  };
}

/** Builds scaffoldOpts and runs the scaffold phase (primary-path pre-compute + main loop). */
async function runScaffoldPhase(
  ctx: PlanCtx,
  wholeFileIds: string[],
): Promise<{
  scaffoldOpts: ScaffoldOpts;
  primaryPaths: Set<string>;
  toWrite: FileMap;
  conflicting: FileMap;
}> {
  const scaffoldOpts: ScaffoldOpts = {
    projectDir: ctx.opts.projectDir,
    overwrite: ctx.inputs.overwrite,
    includeDeps: ctx.inputs.includeDeps,
    scope: ctx.inputs.scope,
    coInstallSet: coInstallSetFor(ctx, wholeFileIds),
  };

  const primaryPaths = await computePrimaryPaths(ctx, wholeFileIds, scaffoldOpts);
  const { toWrite, conflicting } = await scaffoldWholeFiles(ctx, wholeFileIds, scaffoldOpts);
  return { scaffoldOpts, primaryPaths, toWrite, conflicting };
}

/** Builds the full install plan, or returns null when the wizard was cancelled. */
export async function buildAddPlan(selectors: string[], opts: AddOpts): Promise<AddPlan | null> {
  const ctx = await buildPlanCtx(selectors, opts);
  if (!ctx) return null;

  const effective = { kinds: splitCommaFlag(opts.kind), exclude: splitCommaFlag(opts.exclude) };
  const filters = { ...effective, language: ctx.inputs.language };
  const partition = await resolveAndPartitionIds(ctx, filters);

  const { scaffoldOpts, primaryPaths, toWrite, conflicting } = await runScaffoldPhase(
    ctx,
    partition.wholeFileIds,
  );

  return assembleAddPlan(ctx, {
    effective,
    partition,
    scaffoldOpts,
    files: { primaryPaths, toWrite, conflicting },
  });
}
