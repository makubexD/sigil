/**
 * `sigil sync [<template-id>] [--check|--apply [--editorial]] [--changed-since <ref>]`
 * `           [--stale <months>] [--rule <id>] [--kind <k>] [--language <l>] [--provider <p>] [--json]`
 *
 * Author-side propagation command with two analyzers sharing one report/--check/--apply surface:
 *
 *   1. Template drift (src/commands/sync/analyze.ts) — compares an artifact's filled slots
 *      against its declared `template:`'s current `slots:` and literal prose.
 *   2. Conformance (src/commands/sync/conformance/) — compares every catalog artifact against
 *      the standard set by src/targets/doc-refs.ts and the per-provider KindEmitSpecs: is this
 *      artifact shaped the way the current standard requires, on every provider it emits to?
 *      `--rule`/`--kind`/`--language`/`--provider` scope conformance for mass-change review —
 *      bring one language up to standard, or one rule across the whole catalog, reviewing each
 *      as its own diff.
 *
 * Both detect live — no per-artifact revision bookkeeping — and classify each deviation
 * `mechanical` (safe for `--apply` to rewrite unattended) or `review`/`editorial` (needs a human,
 * or `--apply --editorial`'s model-backed pass under its four correctness rails — see
 * conformance/fix-editorial.ts). Three modes share one analysis pass:
 *   - default: report, exit 0.
 *   - `--check`: same report, exit 1 if anything drifted or is non-conformant — the CI gate.
 *   - `--apply`: writes the mechanical fixes (both analyzers); add `--editorial` to also run the
 *     model-backed conformance pass. Refuses on a dirty working tree so the resulting git diff is
 *     itself the review surface.
 *
 * @module
 */
import { execFileSync } from 'node:child_process';
import { loadCatalog } from '../../load';
import type { LoadedCatalog } from '../../types';
import { SigilError } from '../../errors';
import { getAllTargets } from '../../targets/index';
import { analyzeCatalog, findAllStaleDocs, findSupersededSpecs } from './analyze';
import { applyFindings } from './apply';
import { runConformance } from './conformance/detect';
import { applyMechanicalFindings } from './conformance/fix-mechanical';
import { runEditorialFindings } from './conformance/fix-editorial';
import type { ConformanceFinding } from './conformance/types';
import { renderApplySummary, renderReport } from './render';
import type { SyncFinding, SyncOptions } from './types';

export type { SyncOptions } from './types';

/** Template ids touched by files changed since `ref`, per `git diff --name-only`. */
function templatesChangedSince(ref: string, catalogDir: string): Set<string> {
  let out: string;
  try {
    out = execFileSync('git', ['diff', '--name-only', ref, '--', catalogDir], {
      encoding: 'utf-8',
    });
  } catch (err) {
    throw new SigilError(`--changed-since: 'git diff --name-only ${ref}' failed`, {
      hint: 'Confirm the ref exists and this is a git repository.',
      cause: err,
    });
  }
  const changedTemplateFiles = out
    .split('\n')
    .filter(f => f.endsWith('.template.md'))
    .map(f => f.replace(/^.*\/([^/]+)\.template\.md$/, '$1'));
  return new Set(changedTemplateFiles);
}

function scopeToChangedTemplates(findings: SyncFinding[], changed: Set<string>): SyncFinding[] {
  return findings.filter(f => changed.has(f.templateId));
}

/** Refuses `--apply` on a dirty working tree — the git diff after apply is the review surface. */
function assertCleanTreeForApply(): void {
  const out = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf-8' });
  if (out.trim().length > 0) {
    throw new SigilError('sync --apply refuses to run on a dirty working tree.', {
      hint: 'Commit or stash your changes first — the resulting git diff is the review surface.',
    });
  }
}

export interface RunSyncOptions extends Omit<SyncOptions, 'templateFilter'> {
  readonly check: boolean;
  readonly apply: boolean;
}

interface AnalysisResult {
  catalog: LoadedCatalog;
  findings: SyncFinding[];
  stale: ReturnType<typeof findAllStaleDocs>;
  superseded: ReturnType<typeof findSupersededSpecs>;
  conformance: ConformanceFinding[];
}

/** Template-drift findings, scoped to `--changed-since` when set. */
function findTemplateDrift(
  catalog: LoadedCatalog,
  templateId: string | undefined,
  opts: RunSyncOptions,
): SyncFinding[] {
  const findings = analyzeCatalog(catalog, templateId);
  if (!opts.changedSince) return findings;
  const changed = templatesChangedSince(opts.changedSince, opts.catalogDir);
  return scopeToChangedTemplates(findings, changed);
}

/** Runs the analysis pass: load the catalog, find drift + conformance. */
async function analyze(
  templateId: string | undefined,
  opts: RunSyncOptions,
): Promise<AnalysisResult> {
  const catalog = await loadCatalog(opts.catalogDir);
  const conformance = runConformance(catalog, getAllTargets(), {
    ruleId: opts.ruleId,
    kind: opts.kind,
    language: opts.language,
    provider: opts.provider,
  });
  return {
    catalog,
    findings: findTemplateDrift(catalog, templateId, opts),
    stale: findAllStaleDocs(catalog, opts.staleMonths),
    superseded: findSupersededSpecs(),
    conformance,
  };
}

/** `--apply` write path: template fixes, mechanical conformance fixes, and (if requested) editorial. */
async function runApply(analysis: AnalysisResult, opts: RunSyncOptions): Promise<void> {
  const { catalog, findings, conformance } = analysis;
  const ctx = { catalog, targets: getAllTargets() };
  const results = applyFindings(catalog, findings);
  const mechanicalConformance = applyMechanicalFindings(conformance, ctx);
  const editorialResults = opts.editorial ? await runEditorialFindings(conformance, ctx) : [];
  console.log(renderApplySummary(results, mechanicalConformance, editorialResults, opts.json));
}

/** Report path (default / `--check`). Throws to fail CI when `--check` finds a blocking issue. */
function runReport(analysis: AnalysisResult, opts: RunSyncOptions): void {
  const { findings, stale, superseded, conformance } = analysis;
  console.log(renderReport({ findings, stale, superseded, conformance }, opts.json));
  // `superseded` and conformance `warning`-severity findings are advisory — surfaced in every
  // report but never fail --check on their own, same precedent as supersededBy. Conformance
  // `error`-severity findings (e.g. provider-kind-coverage) DO fail --check, same as template
  // drift and stale docs — they are structural gaps, not editorial judgment calls.
  const conformanceErrors = conformance.filter(f => f.severity === 'error');
  if (opts.check && (findings.length > 0 || stale.length > 0 || conformanceErrors.length > 0)) {
    throw new SigilError(
      `${findings.length} artifact(s) drifted from their template, ${stale.length} stale doc(s), ` +
        `${conformanceErrors.length} conformance error(s).`,
    );
  }
}

/** `templateId` is the optional positional arg — omitted means "every template". */
export async function runSync(templateId: string | undefined, opts: RunSyncOptions): Promise<void> {
  if (opts.apply) assertCleanTreeForApply();
  const analysis = await analyze(templateId, opts);
  if (opts.apply) {
    await runApply(analysis, opts);
    return;
  }
  runReport(analysis, opts);
}
