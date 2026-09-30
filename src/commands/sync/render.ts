/**
 * Text and `--json` rendering for `sigil sync` — shared by the report, `--check`, and `--apply`
 * output paths in index.ts.
 *
 * @module
 */
import type { ApplyResult } from './apply';
import type { StaleDoc, SupersededSpec } from './analyze';
import type { MechanicalApplyResult } from './conformance/fix-mechanical';
import type { EditorialResult } from './conformance/fix-editorial';
import type { ConformanceFinding } from './conformance/types';
import type { SyncFinding } from './types';

const JSON_INDENT = 2;

function countByClass(findings: readonly SyncFinding[]): { mechanical: number; review: number } {
  let mechanical = 0;
  let review = 0;
  for (const f of findings) {
    for (const d of f.drifts) {
      if (d.class === 'mechanical') mechanical++;
      else review++;
    }
  }
  return { mechanical, review };
}

function renderFinding(f: SyncFinding): string[] {
  const lines = [`  ${f.artifactId}  (template: ${f.templateId})`];
  for (const d of f.drifts) {
    lines.push(`    [${d.class}] ${d.detail}`);
  }
  return lines;
}

function renderStaleDocs(stale: readonly StaleDoc[]): string[] {
  if (stale.length === 0) return [];
  const lines = ['', 'Stale docs (template and provider-spec citations):'];
  for (const s of stale) {
    lines.push(`  [${s.source}] '${s.url}' last verified ${s.verifiedOn}`);
  }
  return lines;
}

function renderSupersededSpecs(superseded: readonly SupersededSpec[]): string[] {
  if (superseded.length === 0) return [];
  const lines = ['', 'Superseded provider formats (advisory — does not fail --check):'];
  for (const s of superseded) {
    lines.push(`  [${s.source}] superseded by '${s.by}' — ${s.note}`);
  }
  return lines;
}

function renderConformanceFinding(f: ConformanceFinding): string {
  const target = f.artifactId ?? (f.provider ? `[${f.provider}]` : '(catalog-wide)');
  return `  [${f.severity}] ${f.ruleId} — ${target}: ${f.detail}`;
}

function renderConformanceFindings(conformance: readonly ConformanceFinding[]): string[] {
  if (conformance.length === 0) return [];
  const errors = conformance.filter(f => f.severity === 'error').length;
  const warnings = conformance.length - errors;
  return [
    '',
    `Conformance findings (${errors} error — fails --check, ${warnings} warning — advisory):`,
    ...conformance.map(renderConformanceFinding),
  ];
}

export interface SyncReportInput {
  readonly findings: readonly SyncFinding[];
  readonly stale: readonly StaleDoc[];
  readonly superseded: readonly SupersededSpec[];
  readonly conformance: readonly ConformanceFinding[];
}

function renderReportJson(input: SyncReportInput): string {
  const { findings, stale, superseded, conformance } = input;
  return JSON.stringify(
    { findings, staleDocs: stale, supersededSpecs: superseded, conformance },
    null,
    JSON_INDENT,
  );
}

function isReportEmpty(input: SyncReportInput): boolean {
  return (
    input.findings.length === 0 &&
    input.stale.length === 0 &&
    input.superseded.length === 0 &&
    input.conformance.length === 0
  );
}

/** Renders the default report / `--check` text output. */
export function renderReport(input: SyncReportInput, json: boolean): string {
  if (json) return renderReportJson(input);
  if (isReportEmpty(input)) {
    return '✓ No template drift or conformance findings — every artifact matches the current standard.';
  }
  const { findings, stale, superseded, conformance } = input;
  const { mechanical, review } = countByClass(findings);
  const lines = [
    `${findings.length} artifact(s) drifted from their template (${mechanical} mechanical, ${review} review):`,
    '',
    ...findings.flatMap(renderFinding),
    ...renderStaleDocs(stale),
    ...renderSupersededSpecs(superseded),
    ...renderConformanceFindings(conformance),
  ];
  return lines.join('\n');
}

function renderTemplateApplyLines(results: readonly ApplyResult[]): string[] {
  if (results.length === 0) return [];
  const applied = results.filter(r => r.appliedDrifts > 0);
  const reviewOnly = results.filter(r => r.appliedDrifts === 0 && r.skippedReviewDrifts > 0);
  const lines = [
    `Applied ${applied.reduce((n, r) => n + r.appliedDrifts, 0)} template fix(es) across ${applied.length} artifact(s).`,
  ];
  for (const r of applied) lines.push(`  ✓ ${r.artifactId}  (${r.appliedDrifts} fix(es))`);
  if (reviewOnly.length > 0) {
    lines.push('', `${reviewOnly.length} artifact(s) need human review (not auto-applied):`);
    for (const r of reviewOnly)
      lines.push(`  ! ${r.artifactId}  (${r.skippedReviewDrifts} review item(s))`);
  }
  return lines;
}

function renderConformanceApplyLines(
  mechanical: readonly MechanicalApplyResult[],
  editorial: readonly EditorialResult[],
): string[] {
  const lines: string[] = [];
  if (mechanical.length > 0) {
    lines.push('', `Applied ${mechanical.length} conformance fix(es):`);
    for (const r of mechanical) lines.push(`  ✓ [${r.ruleId}] ${r.artifactId}`);
  }
  if (editorial.length > 0) {
    const written = editorial.filter(r => r.status === 'written');
    const rejected = editorial.filter(r => r.status === 'rejected');
    lines.push('', `Editorial pass: ${written.length} written, ${rejected.length} rejected:`);
    for (const r of written) lines.push(`  ✓ [${r.ruleId}] ${r.artifactId}`);
    for (const r of rejected) lines.push(`  ✗ [${r.ruleId}] ${r.artifactId} — ${r.reason}`);
  }
  return lines;
}

function renderApplySummaryJson(
  results: readonly ApplyResult[],
  mechanicalConformance: readonly MechanicalApplyResult[],
  editorialResults: readonly EditorialResult[],
): string {
  return JSON.stringify(
    {
      templateFixes: results,
      conformanceFixes: mechanicalConformance,
      editorial: editorialResults,
    },
    null,
    JSON_INDENT,
  );
}

/** Renders the full `--apply` write summary: template fixes, conformance fixes, editorial pass. */
export function renderApplySummary(
  results: readonly ApplyResult[],
  mechanicalConformance: readonly MechanicalApplyResult[],
  editorialResults: readonly EditorialResult[],
  json: boolean,
): string {
  if (json) return renderApplySummaryJson(results, mechanicalConformance, editorialResults);
  const lines = [
    ...renderTemplateApplyLines(results),
    ...renderConformanceApplyLines(mechanicalConformance, editorialResults),
  ];
  if (lines.length === 0)
    return '✓ Nothing to apply — no mechanical drift or conformance findings.';
  return lines.join('\n');
}
