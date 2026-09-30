/**
 * `when-to-use-lift` — a skill's `## When to Use` body prose must be lifted into `whenToUse:`
 * frontmatter. Claude Code dispatches skills on `description` + `when_to_use`; prose left only in
 * the body is invisible to routing (see docs/decisions/skill-dispatch-audit-2026-08.md, which
 * found 21 of 23 skills silently un-dispatchable for exactly this reason). The fix is fully
 * deterministic — extract the section text, delete the heading — so this is `mechanical`.
 *
 * @module
 */
import type { ConformanceRule, ConformanceFinding, ArtifactEdit } from '../types';
import { CLAUDE_SKILLS_DOC } from '../../../../targets/doc-refs';

const HEADING_RE = /^##\s+When to Use\s*$/i;

interface ExtractedSection {
  readonly text: string;
  readonly remainder: string;
}

/** Finds the line index where the section starting at `startIdx + 1` ends (next `##` or `---`). */
function findSectionEnd(lines: readonly string[], startIdx: number): number {
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/^##\s+/.test(line) || /^---\s*$/.test(line)) return i;
  }
  return lines.length;
}

/** Pulls the `## When to Use` section out of a skill body, returning its text and the body minus that section. */
export function extractWhenToUseSection(body: string): ExtractedSection | undefined {
  const lines = body.split(/\r?\n/);
  const startIdx = lines.findIndex(line => HEADING_RE.test(line.trim()));
  if (startIdx === -1) return undefined;

  const endIdx = findSectionEnd(lines, startIdx);
  const text = lines
    .slice(startIdx + 1, endIdx)
    .join('\n')
    .trim();
  const remainder = [...lines.slice(0, startIdx), ...lines.slice(endIdx)]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text, remainder };
}

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  for (const artifact of ctx.catalog.artifacts) {
    if (artifact.kind !== 'skill') continue;
    if (typeof artifact.frontmatter.whenToUse === 'string') continue;
    const section = extractWhenToUseSection(artifact.body);
    if (!section || section.text.length === 0) continue;
    findings.push({
      ruleId: 'when-to-use-lift',
      severity: 'error',
      artifactId: artifact.id,
      filePath: artifact.filePath,
      detail:
        '"## When to Use" body prose is not reflected in whenToUse frontmatter — invisible to Claude dispatch',
    });
  }
  return findings;
}

function fix(
  finding: ConformanceFinding,
  ctx: Parameters<ConformanceRule['detect']>[0],
): ArtifactEdit | undefined {
  if (!finding.artifactId) return undefined;
  const artifact = ctx.catalog.byId.get(finding.artifactId);
  if (!artifact) return undefined;
  const section = extractWhenToUseSection(artifact.body);
  if (!section) return undefined;
  return {
    artifactId: artifact.id,
    filePath: artifact.filePath,
    frontmatterPatch: { whenToUse: section.text },
    newBody: section.remainder,
  };
}

export const whenToUseLiftRule: ConformanceRule = {
  id: 'when-to-use-lift',
  title: 'Lift "## When to Use" body prose into whenToUse frontmatter',
  class: 'mechanical',
  appliesTo: { kinds: ['skill'] },
  rationale:
    'Claude Code skills dispatch on description + when_to_use; prose left only in the body is ' +
    'invisible to routing.',
  docs: [CLAUDE_SKILLS_DOC],
  detect,
  fix,
};
