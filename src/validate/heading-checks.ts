/**
 * §13: a rule's `extends` chain is flattened by resolve.ts, so an H2 heading repeated between
 * an ancestor and its child ships twice in the rendered body — two sections with the same
 * title, usually a copy-paste of an ancestor section into the child. Silent duplication like
 * this was what step 1 of `docs/plan-catalog-slim.md` removed from the `*-git` rules.
 *
 * Kept separate from resolve.ts: validate must not import the resolve phase (see resolve.ts's
 * header comment), so the flattening is re-derived here from the same `extends` rules.
 */
import type { Artifact, LoadedCatalog } from '../types';
import type { ValidateCtx } from './types';
import { composeArtifactAgainstTemplate } from '../templates';

const H2_RE = /^## (.+)$/;
const FENCE = '```';

/** One body segment in resolution order, tagged with the artifact that contributes it. */
interface HeadingSegment {
  readonly sourceId: string;
  readonly body: string;
}

/**
 * The artifact's own body as resolve.ts would use it: template-composed when it declares
 * `template:`. A malformed template must not break validation, so fall back to the raw body.
 */
function effectiveBody(artifact: Artifact, catalog: LoadedCatalog): string {
  try {
    return composeArtifactAgainstTemplate(artifact, catalog)?.body ?? artifact.body;
  } catch {
    // Validation must never throw on a catalog it is meant to report problems about.
    return artifact.body;
  }
}

/**
 * Flattens one rule's `extends` chain the way resolve.ts does: each ancestor's segments first
 * (recursively, in declaration order), then the rule's own body. A missing ancestor is skipped
 * (schema-checks reports it) and `seen` guards cycles.
 */
function collectSegments(
  artifact: Artifact,
  catalog: LoadedCatalog,
  seen: Set<string>,
): HeadingSegment[] {
  if (seen.has(artifact.id)) return [];

  const nextSeen = new Set(seen).add(artifact.id);
  const segments: HeadingSegment[] = [];
  const extendsIds = (artifact.frontmatter.extends as string[] | undefined) ?? [];
  for (const parentId of extendsIds) {
    const parent = catalog.byId.get(parentId);
    if (!parent) continue;
    segments.push(...collectSegments(parent, catalog, nextSeen));
  }
  segments.push({ sourceId: artifact.id, body: effectiveBody(artifact, catalog) });
  return segments;
}

/** H2 heading texts in a body, ignoring lines inside ``` fenced code blocks. */
function extractH2(body: string): string[] {
  const headings: string[] = [];
  let inFence = false;
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trimEnd();
    if (line.trimStart().startsWith(FENCE)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = H2_RE.exec(line);
    if (match) headings.push(match[1]!);
  }
  return headings;
}

/** One heading text contributed twice, with the two artifacts that contribute it. */
interface RepeatedHeading {
  readonly heading: string;
  readonly firstSourceId: string;
  readonly secondSourceId: string;
}

/** Each heading text a second segment repeats; the first pair wins, later copies are ignored. */
function findRepeatedHeadings(segments: HeadingSegment[]): RepeatedHeading[] {
  const firstSource = new Map<string, string>();
  const repeated: RepeatedHeading[] = [];
  const reported = new Set<string>();
  for (const segment of segments) {
    for (const heading of extractH2(segment.body)) {
      const first = firstSource.get(heading);
      if (first === undefined) {
        firstSource.set(heading, segment.sourceId);
        continue;
      }
      if (reported.has(heading)) continue;
      reported.add(heading);
      repeated.push({ heading, firstSourceId: first, secondSourceId: segment.sourceId });
    }
  }
  return repeated;
}

/**
 * §13: errors once per heading text that appears in more than one segment of a rule's
 * flattened `extends` chain, naming the two artifacts that contribute it.
 */
export function checkRepeatedHeadings(ctx: ValidateCtx): void {
  for (const rule of ctx.catalog.artifacts) {
    if (rule.kind !== 'rule') continue;
    const segments = collectSegments(rule, ctx.catalog, new Set());
    for (const repeated of findRepeatedHeadings(segments)) {
      ctx.errors.push({
        artifactId: rule.id,
        filePath: rule.filePath,
        error:
          `heading "## ${repeated.heading}" appears twice after extends: ` +
          `in ${repeated.firstSourceId} and ${repeated.secondSourceId}`,
      });
    }
  }
}
