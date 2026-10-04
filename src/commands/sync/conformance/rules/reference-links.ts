/**
 * `reference-links` — a skill names each of its reference files with a Markdown link. Claude's and
 * VS Code's skill docs both recommend links, and VS Code says a reference SKILL.md doesn't
 * reference won't load; whether a backtick path counts is the open V1 check
 * (docs/audits/2026-10-03). The link keeps the backtick path as its visible text:
 * [`references/stack-go.md`](references/stack-go.md).
 *
 * Mechanical: `fix()` rewrites each backtick-only mention of a loaded reference into that link,
 * outside fenced code; an existing link, a name that is no reference file, and a pattern such as
 * `references/stack-*.md` are left alone. A reference SKILL.md never names at all is
 * `catalog-layout`'s finding, not this rule's.
 *
 * @module
 */
import fs from 'node:fs';
import type { Artifact } from '../../../../types';
import type { ConformanceRule, ConformanceFinding, ArtifactEdit } from '../types';
import { splitFrontmatterBlock, extractOriginalBody } from '../frontmatter-patch';

const FENCE_RE = /^\s*(```|~~~)/;
const BACKTICK_REF_RE = /(\[)?`references\/([a-z0-9-]+\.md)`(\]\()?/g;

/** The link form of a reference mention. */
const linkFor = (name: string) => `[\`references/${name}\`](references/${name})`;

/** Rewrites backtick-only mentions of `names` into links, line by line, skipping fenced code. */
export function linkReferences(body: string, names: readonly string[]): string {
  const known = new Set(names);
  let inFence = false;
  return body
    .split('\n')
    .map(line => {
      if (FENCE_RE.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return line.replace(BACKTICK_REF_RE, (match, open, name: string, close) =>
        open || close || !known.has(name) ? match : linkFor(name),
      );
    })
    .join('\n');
}

/** The loaded references `skill`'s body mentions only in backticks. */
function unlinkedReferences(skill: Artifact): string[] {
  const names = (skill.references ?? []).map(ref => ref.name);
  const linked = linkReferences(skill.body, names);
  return names.filter(
    name => linked.includes(linkFor(name)) && !skill.body.includes(linkFor(name)),
  );
}

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  return ctx.catalog.artifacts
    .filter(a => a.kind === 'skill')
    .flatMap(skill =>
      unlinkedReferences(skill).map(name => ({
        ruleId: 'reference-links',
        severity: 'error' as const,
        artifactId: skill.id,
        filePath: skill.filePath,
        detail: `references/${name} is named only in backticks; link it so every tool loads it`,
      })),
    );
}

/** Links every backtick-only reference mention in the skill's current body (read from disk). */
function fix(
  finding: ConformanceFinding,
  ctx: Parameters<ConformanceRule['detect']>[0],
): ArtifactEdit | undefined {
  if (!finding.artifactId || !finding.filePath) return undefined;
  const skill = ctx.catalog.byId.get(finding.artifactId);
  if (!skill) return undefined;
  const raw = fs.readFileSync(finding.filePath, 'utf-8');
  const { bodyStart } = splitFrontmatterBlock(raw);
  const names = (skill.references ?? []).map(ref => ref.name);
  const newBody = linkReferences(extractOriginalBody(raw, bodyStart), names);
  return { artifactId: skill.id, filePath: skill.filePath, newBody };
}

export const referenceLinksRule: ConformanceRule = {
  id: 'reference-links',
  title: 'A skill names its reference files with Markdown links',
  class: 'mechanical',
  appliesTo: { kinds: ['skill'] },
  rationale:
    "Claude's and VS Code's skill docs recommend linking reference files, and VS Code loads only " +
    'the ones SKILL.md references; a link works in every tool, a bare backtick path may not.',
  detect,
  fix,
};
