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
import { resolveSelection, CONFIG_KINDS, type SkippedArtifact } from '../../select';
import { SigilError } from '../../errors';
import { isInteractiveTTY, runWizard, printSkippedAdvice, type WizardResult } from '../../wizard';
import { checkOutputContract } from '../../targets/output-contract';
import { computeInstallStates } from '../../install-state';
import { loadAndValidate, partitionFiles, detectProjectTarget } from '../../cli-helpers';
import { renderViolations } from '../shared/contract';
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

/** Resolves the effective selectors/target/flags, running the wizard when needed. */
async function resolveInputs(
  selectors: string[],
  opts: AddOpts,
  resolved: ResolvedCatalog,
  packs: Parameters<typeof runWizard>[1],
): Promise<{
  selectors: string[];
  target: string | undefined;
  includeDeps: boolean;
  overwrite: boolean;
  language: string | undefined;
  scope: ConfigScope;
} | null> {
  const needsWizard = (selectors.length === 0 || opts.interactive) && !opts.yes;
  const baseScope: ConfigScope = opts.settingsLocal
    ? 'local'
    : ((opts.scope as ConfigScope | undefined) ?? 'project');

  if (!needsWizard) {
    return {
      selectors,
      target: opts.target,
      includeDeps: opts.deps !== false,
      overwrite: opts.overwrite,
      language: opts.language,
      scope: baseScope,
    };
  }

  if (!isInteractiveTTY()) {
    throw new SigilError('No selectors provided and stdin/stdout is not an interactive terminal.', {
      hint:
        '  Provide at least one selector (e.g. `add all` or `add skill:csharp/cs-generate-tests`)\n' +
        '  or use --yes to confirm non-interactive mode.\n\n' +
        '  Available selectors:\n' +
        '    all                         install the full catalog\n' +
        '    pack:<name>                 install a named pack\n' +
        '    kind:<kind>                 install all of a kind (skill/agent/rule/prompt)\n' +
        '    <kind>:<id>                 install a specific artifact\n\n' +
        '  Run `sigil list` to browse available artifacts.',
    });
  }

  const detectedTarget = detectProjectTarget(opts.projectDir, { verbose: false });
  const wizardResult: WizardResult | null = await runWizard(
    resolved,
    packs,
    detectedTarget,
    opts.projectDir,
  );
  if (!wizardResult) return null;

  return {
    selectors: wizardResult.selectors,
    target: wizardResult.target,
    includeDeps: wizardResult.includeDeps,
    overwrite: wizardResult.overwrite,
    language: wizardResult.language ?? opts.language,
    scope: (wizardResult.configScope as ConfigScope | undefined) ?? baseScope,
  };
}

/** Builds the full install plan, or returns null when the wizard was cancelled. */
export async function buildAddPlan(selectors: string[], opts: AddOpts): Promise<AddPlan | null> {
  const { catalog, packsConfig } = await loadAndValidate(opts.catalogDir, opts.packs);
  const resolved = resolveCatalog(catalog);

  const inputs = await resolveInputs(selectors, opts, resolved, packsConfig.packs);
  if (!inputs) return null;

  const targetName = inputs.target ?? detectProjectTarget(opts.projectDir, { verbose: true });
  const target = getTarget(targetName);
  if (!target.scaffold) {
    throw new SigilError(`Target '${targetName}' does not support the add command.`);
  }

  const effectiveKinds = opts.kind
    ?.split(',')
    .map(k => k.trim())
    .filter(Boolean);
  const effectiveExclude = opts.exclude
    ?.split(',')
    .map(k => k.trim())
    .filter(Boolean);
  const filters = { kinds: effectiveKinds, exclude: effectiveExclude, language: inputs.language };

  let ids: string[];
  let skipped: SkippedArtifact[];
  try {
    const result = resolveSelection(
      inputs.selectors,
      filters,
      resolved,
      packsConfig.packs,
      target.supportedKinds ?? [],
      targetName,
    );
    ids = result.ids;
    skipped = result.skipped;
  } catch (err) {
    throw new SigilError((err as Error).message, { cause: err });
  }

  printSkippedAdvice(skipped, target);

  // ── Manifest-aware install-state detection ─────────────────────────────────
  let upToDateIds: string[] = [];
  if (!opts.dryRun && ids.length > 0) {
    try {
      const installStates = await computeInstallStates(
        ids,
        target,
        resolved,
        opts.projectDir,
        inputs.scope,
      );
      if (!inputs.overwrite) {
        upToDateIds = ids.filter(id => installStates.get(id)?.state === 'up-to-date');
        for (const id of upToDateIds) {
          console.log(`  =  ${id}  (✓ already up to date — skipped)`);
        }
      }
    } catch {
      // State detection failed — proceed without skip logic (safe fallback)
    }
  }
  const upToDateSet = new Set(upToDateIds);

  const wholeFileIds = ids.filter(
    id => !CONFIG_KINDS.has(resolved.byId.get(id)?.kind ?? '') && !upToDateSet.has(id),
  );
  const configIds = ids.filter(
    id => CONFIG_KINDS.has(resolved.byId.get(id)?.kind ?? '') && !upToDateSet.has(id),
  );

  const scaffoldOpts: ScaffoldOpts = {
    projectDir: opts.projectDir,
    overwrite: inputs.overwrite,
    includeDeps: inputs.includeDeps,
    scope: inputs.scope,
    coInstallSet: new Set(wholeFileIds),
  };

  // Pre-compute primary (no-dep) file paths for dep tagging in the summary listing.
  const primaryPaths = new Set<string>();
  if (inputs.includeDeps) {
    const primaryScaffoldOpts = { ...scaffoldOpts, includeDeps: false };
    for (const id of wholeFileIds) {
      try {
        const pFiles = await target.scaffold!(id, resolved, primaryScaffoldOpts);
        for (const k of Object.keys(pFiles)) primaryPaths.add(k);
      } catch {
        /* ignore — the main scaffold loop below will surface real errors */
      }
    }
  }

  const allFiles: FileMap = {};
  for (const id of wholeFileIds) {
    try {
      const files = await target.scaffold!(id, resolved, scaffoldOpts);
      Object.assign(allFiles, files);
    } catch (err) {
      throw new SigilError(`Failed to scaffold '${id}': ${(err as Error).message}`, { cause: err });
    }
  }

  const violations = checkOutputContract(allFiles, target.outputContracts ?? []);
  if (violations.length > 0) {
    throw new SigilError(
      `${violations.length} output-conformance error(s). Install aborted — no files were written.`,
      { hint: renderViolations(violations) },
    );
  }

  const { toWrite, conflicting } = partitionFiles(allFiles, opts.projectDir);

  return {
    opts,
    resolved,
    target,
    targetName,
    effectiveSelectors: inputs.selectors,
    effectiveLanguage: inputs.language,
    effectiveKinds,
    effectiveExclude,
    effectiveIncludeDeps: inputs.includeDeps,
    effectiveOverwrite: inputs.overwrite,
    effectiveScope: inputs.scope,
    skipped,
    upToDateIds,
    wholeFileIds,
    configIds,
    scaffoldOpts,
    primaryPaths,
    toWrite,
    conflicting,
  };
}
