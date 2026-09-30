/**
 * `sigil sync --apply` (conformance half) — writes every `mechanical` rule's deterministic fix.
 * Never touches an `editorial` finding; those need `--apply --editorial` (see fix-editorial.ts).
 *
 * @module
 */
import fs from 'fs';
import matter from 'gray-matter';
import { serializeYamlEntry } from '../../../authoring/frontmatter';
import { CONFORMANCE_RULES } from './registry';
import type { ArtifactEdit, ConformanceContext, ConformanceFinding } from './types';

/** Applies one ArtifactEdit's frontmatter patch and/or body replacement, writing the file once. */
function writeArtifactEdit(edit: ArtifactEdit): void {
  const raw = fs.readFileSync(edit.filePath, 'utf-8');
  const parsed = matter(raw);
  const data = { ...parsed.data };

  if (edit.frontmatterPatch) {
    for (const [key, value] of Object.entries(edit.frontmatterPatch)) {
      if (value === undefined) delete data[key];
      else data[key] = value;
    }
  }

  const yamlBlock = Object.entries(data)
    .map(([key, value]) => serializeYamlEntry(key, value))
    .join('\n');
  const body = (edit.newBody ?? parsed.content.trim()).trim();
  fs.writeFileSync(edit.filePath, `---\n${yamlBlock}\n---\n\n${body}\n`, 'utf-8');
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
