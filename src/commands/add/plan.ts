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
import { applyProjectOverlays } from '../../overlay-report';
import { getTarget } from '../../targets';
import type { SkippedArtifact } from '../../select';
import { SigilError } from '../../errors';
import type { PluginOverlap } from '../../plugin-overlap';
import { loadAndValidate, detectProjectTarget } from '../../cli-helpers';
import { resolveInputs } from './resolve-inputs';
import { resolveAndPartitionIds } from './plan-ids';
import { parseVarFlags } from '../../mcp-vars';
import type { VarValues } from '../../mcp-vars';
import { resolvePlanVars } from './plan-vars';
import type { PlannedPartition } from './plan-vars';
import { buildScaffoldOpts, computePrimaryPaths, scaffoldWholeFiles } from './plan-scaffold';
import type { PartitionedIds, PlanCtx } from './plan-context';
import type { FileMap, ConfigScope, ResolvedCatalog, Target } from '../../types';
import type { AddOpts } from './index';

export interface ScaffoldOpts {
  projectDir: string;
  overwrite: boolean;
  includeDeps: boolean;
  scope: ConfigScope;
  coInstallSet: Set<string>;
  /** Dependencies an enabled plugin already delivers, never written under `--complement`. */
  excludeDeps: ReadonlySet<string>;
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
  /** Skip picks an enabled plugin already delivers (--complement). */
  readonly effectiveComplement: boolean;
  readonly fromWizard: boolean;
  readonly skipped: SkippedArtifact[];
  /** The install value for every variable this plan's `mcp` artifacts declare. */
  readonly vars: VarValues;
  /** Ids an enabled plugin also delivers, when not running under --complement (empty then). */
  readonly pluginOverlaps: ReadonlyMap<string, PluginOverlap>;
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
async function buildPlanCtx(
  selectors: string[],
  opts: AddOpts,
  varFlags: VarValues,
): Promise<PlanCtx | null> {
  const { catalog, packsConfig } = await loadAndValidate(opts.catalogDir, opts.packs);
  const overlaid = applyProjectOverlays(resolveCatalog(catalog), opts.projectDir);
  const { resolved, refused } = overlaid;

  const inputs = await resolveInputs(selectors, opts, overlaid, packsConfig);
  if (!inputs) return null;

  const targetName = inputs.target ?? detectProjectTarget(opts.projectDir, { verbose: true });
  const target = resolveScaffoldTarget(targetName);

  const ctx = { opts, varFlags, resolved, refusedOverlays: refused, target, targetName, inputs };
  return { ...ctx, packs: packsConfig.packs, marketplace: packsConfig.marketplace };
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
  | 'effectiveComplement'
  | 'fromWizard'
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
    effectiveComplement: ctx.inputs.complement,
    fromWizard: ctx.inputs.fromWizard,
  };
}

/** Parameters for {@link assembleAddPlan} beyond the shared PlanCtx. */
interface AssembleAddPlanOptions {
  effective: { kinds: string[] | undefined; exclude: string[] | undefined };
  partition: PlannedPartition;
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
  partition: PartitionedIds,
): Promise<{
  scaffoldOpts: ScaffoldOpts;
  primaryPaths: Set<string>;
  toWrite: FileMap;
  conflicting: FileMap;
}> {
  const { wholeFileIds } = partition;
  const scaffoldOpts = buildScaffoldOpts(ctx, partition);
  const primaryPaths = await computePrimaryPaths(ctx, wholeFileIds, scaffoldOpts);
  const { toWrite, conflicting } = await scaffoldWholeFiles(ctx, wholeFileIds, scaffoldOpts);
  return { scaffoldOpts, primaryPaths, toWrite, conflicting };
}

/** Builds the full install plan, or returns null when the wizard was cancelled. */
export async function buildAddPlan(selectors: string[], opts: AddOpts): Promise<AddPlan | null> {
  const varFlags = parseVarFlags(opts.var ?? []);
  const ctx = await buildPlanCtx(selectors, opts, varFlags);
  if (!ctx) return null;

  const effective = { kinds: splitCommaFlag(opts.kind), exclude: splitCommaFlag(opts.exclude) };
  const filters = { ...effective, language: ctx.inputs.language };
  const partition = await resolvePlanVars(ctx, await resolveAndPartitionIds(ctx, filters));
  if (partition === null) return null;

  const { scaffoldOpts, primaryPaths, toWrite, conflicting } = await runScaffoldPhase(
    ctx,
    partition,
  );

  return assembleAddPlan(ctx, {
    effective,
    partition,
    scaffoldOpts,
    files: { primaryPaths, toWrite, conflicting },
  });
}
