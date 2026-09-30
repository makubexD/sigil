/**
 * `sigil sync --apply` (conformance half) — writes every `mechanical` rule's deterministic fix.
 * Never touches an `editorial` finding; those need `--apply --editorial` (see fix-editorial.ts).
 *
 * @module
 */
import fs from 'fs';
import {
  applyFrontmatterPatch,
  extractOriginalBody,
  splitFrontmatterBlock,
} from './frontmatter-patch';
import { CONFORMANCE_RULES } from './registry';
import type { ArtifactEdit, ConformanceContext, ConformanceFinding } from './types';

/** Applies one ArtifactEdit's frontmatter patch and/or body replacement, writing the file once. */
function writeArtifactEdit(edit: ArtifactEdit): void {
  const raw = fs.readFileSync(edit.filePath, 'utf-8');
  const { frontmatterLines, bodyStart } = splitFrontmatterBlock(raw);
  const newFrontmatter = edit.frontmatterPatch
    ? applyFrontmatterPatch(frontmatterLines, edit.frontmatterPatch)
    : frontmatterLines;
  const body = (edit.newBody ?? extractOriginalBody(raw, bodyStart)).trim();
  fs.writeFileSync(edit.filePath, `---\n${newFrontmatter.join('\n')}\n---\n\n${body}\n`, 'utf-8');
}

export interface MechanicalApplyResult {
  readonly ruleId: string;
  readonly artifactId: string;
  readonly filePath: string;
}

/**
 * Applies every mechanical-rule finding with a `fix()`, one file write per edit. Findings from
 * `editorial` rules, or from a `mechanical` rule with no `fix` (e.g. provider-kind-coverage —
 * structural gaps aren't safe to auto-generate), are skipped — they stay report-only.
 */
export function applyMechanicalFindings(
  findings: readonly ConformanceFinding[],
  ctx: ConformanceContext,
): MechanicalApplyResult[] {
  const rulesById = new Map(CONFORMANCE_RULES.map(rule => [rule.id, rule]));
  const results: MechanicalApplyResult[] = [];

  for (const finding of findings) {
    const rule = rulesById.get(finding.ruleId);
    if (!rule || rule.class !== 'mechanical' || !rule.fix) continue;
    const edit = rule.fix(finding, ctx);
    if (!edit) continue;
    writeArtifactEdit(edit);
    results.push({ ruleId: finding.ruleId, artifactId: edit.artifactId, filePath: edit.filePath });
  }

  return results;
}
