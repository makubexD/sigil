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

const FENCE_RE = /^\s*(`{3,}|~{3,})/;
// A whole Markdown link (left as it is, so a mention inside its text never nests) or a bare
// backtick mention of a reference file.
const LINK_OR_REF_RE = /(\[[^\]\n]*\]\([^)\n]*\))|`references\/([a-z0-9-]+\.md)`/g;

/** The link form of a reference mention. */
const linkFor = (name: string) => `[\`references/${name}\`](references/${name})`;

/** Links the bare mentions of `known` names on one line outside code. */
const linkLine = (line: string, known: ReadonlySet<string>) =>
  line.replace(LINK_OR_REF_RE, (match, link: string | undefined, name: string | undefined) =>
    link || !name || !known.has(name) ? match : linkFor(name),
  );

/**
 * Rewrites backtick-only mentions of `names` into links, line by line, skipping fenced code. A
 * fence closes only on the same marker at least as long as the one that opened it (CommonMark).
 */
export function linkReferences(body: string, names: readonly string[]): string {
  const known = new Set(names);
  let fence: string | undefined;
  return body
    .split('\n')
    .map(line => {
      const marker = FENCE_RE.exec(line)?.[1];
      if (fence === undefined) {
        if (marker) fence = marker;
        return marker ? line : linkLine(line, known);
      }
      if (marker && closesFence(marker, fence)) fence = undefined;
      return line;
    })
    .join('\n');
}

const closesFence = (marker: string, open: string) =>
  marker[0] === open[0] && marker.length >= open.length;

/** The loaded references `skill`'s body still names somewhere only in backticks. */
function unlinkedReferences(skill: Artifact): string[] {
  const names = (skill.references ?? []).map(ref => ref.name);
  return names.filter(name => linkReferences(skill.body, [name]) !== skill.body);
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
        detail: `references/${name} is named only in backticks; link it, as the providers' skill docs recommend`,
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
    'the ones SKILL.md references; whether a bare backtick path counts is unverified (V1).',
  detect,
  fix,
};
