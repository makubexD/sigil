/**
 * `related-artifacts` — an agent with sibling specialist agents in the same language should
 * cross-reference them via `relatedArtifacts` (see `typescript/ts-code-reviewer.agent.md` for the
 * exemplar shape: `id` + `relation` (escalates-to | complements | see-also) + a one-sentence
 * `reason`). Deciding WHICH relation applies to WHICH sibling, and writing the reason, is
 * judgment — not deterministic from the `uses`/`extends` graph alone — so this is `editorial`,
 * despite being classified `mechanical` in early drafts of this audit's plan; reclassified once
 * the exemplar's actual shape (relation + reason, not just an id list) made the judgment call
 * this rule requires. See the decision log for that correction.
 *
 * @module
 */
import type { ConformanceRule, ConformanceFinding, EditorialTask } from '../types';

function hasRelatedArtifacts(frontmatter: Record<string, unknown>): boolean {
  return Array.isArray(frontmatter.relatedArtifacts) && frontmatter.relatedArtifacts.length > 0;
}

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  for (const artifact of ctx.catalog.artifacts) {
    if (artifact.kind !== 'agent') continue;
    if (hasRelatedArtifacts(artifact.frontmatter)) continue;
    const language = artifact.frontmatter.language;
    const siblingCount = ctx.catalog.artifacts.filter(
      a => a.kind === 'agent' && a.id !== artifact.id && a.frontmatter.language === language,
    ).length;
    if (siblingCount === 0) continue; // nothing plausible to cross-reference
    findings.push({
      ruleId: 'related-artifacts',
      severity: 'warning',
      artifactId: artifact.id,
      filePath: artifact.filePath,
      detail: `no relatedArtifacts — ${siblingCount} sibling agent(s) in the same language are not cross-referenced`,
    });
  }
  return findings;
}

function candidateSiblings(
  ctx: Parameters<ConformanceRule['detect']>[0],
  artifactId: string,
  language: unknown,
): string[] {
  return ctx.catalog.artifacts
    .filter(a => a.kind === 'agent' && a.id !== artifactId && a.frontmatter.language === language)
    .map(a => `${a.id} — ${String(a.frontmatter.description ?? '')}`);
}

function buildInstruction(siblings: readonly string[]): string {
  return (
    'Author a relatedArtifacts frontmatter array cross-referencing the genuinely related ' +
    'sibling agents below (skip any with no real overlap in scope — not every sibling needs ' +
    'an entry). For each entry, pick relation "escalates-to" (delegate when this agent\'s ' +
    'scope is exceeded), "complements" (parallel specialist, non-overlapping scope), or ' +
    '"see-also" (loosely related), and write a one-sentence reason. Match the shape of ' +
    "typescript/ts-code-reviewer.agent.md's relatedArtifacts block exactly.\n\nCandidate siblings:\n" +
    siblings.map(s => `- ${s}`).join('\n')
  );
}

function editorialTask(
  finding: ConformanceFinding,
  ctx: Parameters<ConformanceRule['detect']>[0],
): EditorialTask | undefined {
  if (!finding.artifactId || !finding.filePath) return undefined;
  const artifact = ctx.catalog.byId.get(finding.artifactId);
  if (!artifact) return undefined;
  const siblings = candidateSiblings(ctx, artifact.id, artifact.frontmatter.language);
  return {
    artifactId: finding.artifactId,
    filePath: finding.filePath,
    kind: 'agent',
    instruction: buildInstruction(siblings),
    ownedFields: ['relatedArtifacts'],
  };
}

export const relatedArtifactsRule: ConformanceRule = {
  id: 'related-artifacts',
  title: 'Agents should cross-reference related sibling agents',
  class: 'editorial',
  appliesTo: { kinds: ['agent'] },
  rationale:
    'relatedArtifacts drives the Boundary section adapters render when siblings are co-installed ' +
    '— an agent with no cross-references is undiscoverable from its siblings.',
  detect,
  editorialTask,
};
