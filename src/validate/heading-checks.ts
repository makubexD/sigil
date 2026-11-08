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

const H2_RE = /^ {0,3}##[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;
/** CommonMark opening fence: up to 3 spaces, then 3+ backticks or 3+ tildes. */
const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})/;
/** CommonMark closing fence: the same marker, up to 3 spaces of indent, nothing else. */
const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

/** An open code fence: its marker character and run length (CommonMark treats them as distinct). */
interface Fence {
  readonly char: '`' | '~';
  readonly length: number;
}

/** The fence a line opens, or undefined when the line is not an opening fence. */
function openingFence(line: string): Fence | undefined {
  const match = FENCE_OPEN_RE.exec(line);
  if (!match) return undefined;
  const marker = match[1]!;
  return { char: marker[0] as '`' | '~', length: marker.length };
}

/** Whether a line closes `fence`: same character, at least as long, nothing but whitespace after. */
function closesFence(line: string, fence: Fence): boolean {
  const match = FENCE_CLOSE_RE.exec(line);
  if (!match) return false;
  const marker = match[1]!;
  return marker[0] === fence.char && marker.length >= fence.length;
}

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

/** H2 heading texts in a body, ignoring lines inside CommonMark fenced code blocks. */
function extractH2(body: string): string[] {
  const headings: string[] = [];
  let openFence: Fence | undefined;
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trimEnd();
    if (openFence) {
      if (closesFence(line, openFence)) openFence = undefined;
      continue;
    }
    const fence = openingFence(line);
    if (fence) {
      openFence = fence;
      continue;
    }
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

/** Two headings are the same when their text matches after collapsing whitespace and lowercasing. */
function headingKey(heading: string): string {
  return heading.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** The first contribution of one heading key: its text as written, and the artifact. */
interface FirstHeading {
  readonly heading: string;
  readonly sourceId: string;
}

/** State shared across the scan: the first source per key and the repeats reported so far. */
interface RepeatAccumulator {
  readonly firstByKey: Map<string, FirstHeading>;
  readonly repeated: RepeatedHeading[];
  readonly reported: Set<string>;
}

/** Records one heading occurrence, adding a repeat the first time a key is seen again. */
function recordRepeatedHeading(heading: string, sourceId: string, acc: RepeatAccumulator): void {
  const key = headingKey(heading);
  const first = acc.firstByKey.get(key);
  if (first === undefined) {
    acc.firstByKey.set(key, { heading, sourceId });
    return;
  }
  if (acc.reported.has(key)) return;
  acc.reported.add(key);
  acc.repeated.push({
    heading: first.heading,
    firstSourceId: first.sourceId,
    secondSourceId: sourceId,
  });
}

/** Each heading a later segment repeats; the first pair wins, later copies are ignored. */
function findRepeatedHeadings(segments: HeadingSegment[]): RepeatedHeading[] {
  const acc: RepeatAccumulator = {
    firstByKey: new Map<string, FirstHeading>(),
    repeated: [],
    reported: new Set<string>(),
  };
  for (const segment of segments) {
    for (const heading of extractH2(segment.body)) {
      recordRepeatedHeading(heading, segment.sourceId, acc);
    }
  }
  return acc.repeated;
}

/** Names the two sources, or the one source that contributed the heading through two paths. */
function repeatedHeadingMessage(ruleId: string, repeated: RepeatedHeading): string {
  const { heading, firstSourceId, secondSourceId } = repeated;
  if (firstSourceId === secondSourceId) {
    return firstSourceId === ruleId
      ? `heading "## ${heading}" appears twice within ${firstSourceId}`
      : `heading "## ${heading}" is inherited twice through more than one extends path: ` +
          `from ${firstSourceId}`;
  }
  return (
    `heading "## ${heading}" appears twice after extends: ` +
    `in ${firstSourceId} and ${secondSourceId}`
  );
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
        error: repeatedHeadingMessage(rule.id, repeated),
      });
    }
  }
}
