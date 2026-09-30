/**
 * `description-budget` — Claude Code truncates a skill's combined `description` + `when_to_use`
 * text at 1,536 characters in the skill listing (Claude Code — Skills, verified 2026-08-10). A
 * skill over that budget silently loses its tail in the listing Claude actually dispatches
 * against — the truncation point is arbitrary text, not a sentence boundary, so it can cut a
 * trigger phrase or the "complements X" clause exactly where it matters most.
 *
 * The 2026-08-10 frontmatter audit found the catalog's worst case (`typescript/ts-release`) at 576
 * chars — nowhere near the cap today. This rule exists as a regression guard for future editorial
 * passes (`when-to-use-quality` lengthens `whenToUse`; nothing currently stops it from growing
 * past the cap), not because a violation exists now. No `fix()`: trimming which sentence to cut
 * needs judgment about what's load-bearing, the same reasoning `body-density` already applies to
 * skill bodies — `editorial`.
 *
 * @module
 */
import type { ConformanceRule, ConformanceFinding, EditorialTask } from '../types';
import { CLAUDE_SKILLS_DOC } from '../../../../targets/doc-refs';

const CHAR_BUDGET = 1536;

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  for (const artifact of ctx.catalog.artifacts) {
    if (artifact.kind !== 'skill') continue;
    const description = (artifact.frontmatter.description as string | undefined) ?? '';
    const whenToUse = (artifact.frontmatter.whenToUse as string | undefined) ?? '';
    const total = description.length + whenToUse.length;
    if (total <= CHAR_BUDGET) continue;
    findings.push({
      ruleId: 'description-budget',
      severity: 'error',
      artifactId: artifact.id,
      filePath: artifact.filePath,
      detail:
        `description (${description.length}) + whenToUse (${whenToUse.length}) = ${total} chars ` +
        `exceeds Claude Code's ${CHAR_BUDGET}-char skill-listing truncation budget`,
    });
  }
  return findings;
}

function editorialTask(
  finding: ConformanceFinding,
  ctx: Parameters<ConformanceRule['detect']>[0],
): EditorialTask | undefined {
  if (!finding.artifactId || !finding.filePath) return undefined;
  const artifact = ctx.catalog.byId.get(finding.artifactId);
  if (!artifact) return undefined;
  return {
    artifactId: finding.artifactId,
    filePath: finding.filePath,
    kind: 'skill',
    instruction:
      `Trim description and/or whenToUse so their combined length is under ${CHAR_BUDGET} ` +
      'characters. Preserve the most concrete, distinguishing trigger phrases and the ' +
      '"complements X" clause if present — those are what Claude actually pattern-matches ' +
      'against, and truncation would cut them arbitrarily anyway. Cut generic or redundant ' +
      'wording first.',
    ownedFields: ['description', 'whenToUse'],
  };
}

export const descriptionBudgetRule: ConformanceRule = {
  id: 'description-budget',
  title: 'description + whenToUse must stay under the 1,536-char skill-listing cap',
  class: 'editorial',
  appliesTo: { kinds: ['skill'] },
  rationale:
    "Claude Code truncates a skill's listing text at 1,536 combined chars — an over-budget " +
    'skill loses part of its dispatch signal at an arbitrary cut point.',
  docs: [CLAUDE_SKILLS_DOC],
  detect,
  editorialTask,
};
