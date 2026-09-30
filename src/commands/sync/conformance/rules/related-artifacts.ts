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

type Artifact = Parameters<ConformanceRule['detect']>[0]['catalog']['artifacts'][number];

function hasRelatedArtifacts(frontmatter: Record<string, unknown>): boolean {
  return Array.isArray(frontmatter.relatedArtifacts) && frontmatter.relatedArtifacts.length > 0;
}

/**
 * Groups agent artifacts by language once, so `detect()`/`candidateSiblings()` do a Map lookup per
 * artifact instead of re-scanning the whole catalog per artifact. Was an O(n²) full-catalog
 * `.filter()` inside the per-artifact loop (once in `detect`, again in `candidateSiblings` for
 * every finding) — flagged by a dogfooded `ts-performance-profiler` run during the 2026-08-25
 * catalog audit's recall re-measurement (docs/audits/2026-08-25/register.md) and fixed here in the
 * 2026-08-26 round.
 */
function groupAgentsByLanguage(artifacts: readonly Artifact[]): Map<unknown, Artifact[]> {
  const byLanguage = new Map<unknown, Artifact[]>();
  for (const a of artifacts) {
    if (a.kind !== 'agent') continue;
    const lang = a.frontmatter.language;
    const group = byLanguage.get(lang) ?? [];
    byLanguage.set(lang, group);
    group.push(a);
  }
  return byLanguage;
}

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  const byLanguage = groupAgentsByLanguage(ctx.catalog.artifacts);
  for (const artifact of ctx.catalog.artifacts) {
    if (artifact.kind !== 'agent') continue;
    if (hasRelatedArtifacts(artifact.frontmatter)) continue;
    const language = artifact.frontmatter.language;
    const siblingCount = (byLanguage.get(language) ?? []).filter(a => a.id !== artifact.id).length;
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
  const byLanguage = groupAgentsByLanguage(ctx.catalog.artifacts);
  return (byLanguage.get(language) ?? [])
    .filter(a => a.id !== artifactId)
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
