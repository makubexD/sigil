/**
 * `sigil sync --apply` (conformance half) — writes every `mechanical` rule's deterministic fix.
 * Never touches an `editorial` finding; those need `--apply --editorial` (see fix-editorial.ts).
 *
 * @module
 */
import fs from 'fs';
import { serializeYamlEntry } from '../../../authoring/frontmatter';
import { CONFORMANCE_RULES } from './registry';
import type { ArtifactEdit, ConformanceContext, ConformanceFinding } from './types';

/**
 * Splits a raw file into its `---\n...\n---` frontmatter block and the body that follows,
 * preserving every byte of both — unlike gray-matter's own reparse-and-restringify, this never
 * touches a line the caller didn't ask to change.
 */
function splitFrontmatterBlock(raw: string): { frontmatterLines: string[]; bodyStart: number } {
  const lines = raw.split(/\r?\n/);
  const closeIdx = lines.slice(1).findIndex(line => line === '---') + 1;
  return { frontmatterLines: lines.slice(1, closeIdx), bodyStart: closeIdx + 1 };
}

/**
 * Applies a frontmatter patch to the ORIGINAL lines, byte-preserving every untouched key —
 * `sigil` catalog conventions (double-quoted title/description, etc.) survive edits this way
 * instead of being silently reformatted by a full reserialize. Only keys actually in `patch` are
 * added, removed, or replaced; `undefined` removes an existing key.
 */
function applyFrontmatterPatch(lines: string[], patch: Record<string, unknown>): string[] {
  const remaining = new Map(Object.entries(patch));
  const kept = lines.filter(line => {
    const key = line.match(/^([A-Za-z][A-Za-z0-9_-]*):/)?.[1];
    if (!key || !remaining.has(key)) return true;
    remaining.delete(key); // dropped here; re-added below if its patch value isn't undefined
    return false;
  });
  const added = [...remaining.entries()]
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => serializeYamlEntry(key, value));
  return [...kept, ...added];
}

/** Applies one ArtifactEdit's frontmatter patch and/or body replacement, writing the file once. */
function writeArtifactEdit(edit: ArtifactEdit): void {
  const raw = fs.readFileSync(edit.filePath, 'utf-8');
  const { frontmatterLines, bodyStart } = splitFrontmatterBlock(raw);
  const newFrontmatter = edit.frontmatterPatch
    ? applyFrontmatterPatch(frontmatterLines, edit.frontmatterPatch)
    : frontmatterLines;
  const originalBody = raw.split(/\r?\n/).slice(bodyStart).join('\n').trim();
  const body = (edit.newBody ?? originalBody).trim();
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
