/**
 * `when-to-use-quality` — an authored `whenToUse` should read like `typescript/ts-audit-deps`'s:
 * concrete quoted trigger phrases the user would actually type, plus an explicit "complements
 * X" clause naming the sibling it's not for. A terse or generic `whenToUse` is technically present
 * (so `when-to-use-lift` won't flag it) but still weak for dispatch — rewriting to the exemplar's
 * shape needs judgment, so this is `editorial`, not `mechanical`.
 *
 * Also flags a skill with NO `whenToUse` at all and no `## When to Use` body section to lift
 * (`when-to-use-lift` only fires when there IS a body section to extract — a skill with neither
 * fell through both rules undetected, e.g. python/py-pytest-testing and react/component-testing,
 * found by the 2026-08 frontmatter audit). Same editorial task either way: author one from scratch
 * or rewrite a weak one — the model instruction already handles "no existing whenToUse" via its
 * own judgment, so one detect()/editorialTask() pair covers both cases.
 *
 * A third case: a `whenToUse` sentence that repeats a `description` sentence word for word. A tool
 * that lists both fields shows it twice in every session (scripts/listing-load.cjs counts both).
 *
 * @module
 */
import type { ConformanceRule, ConformanceFinding, EditorialTask } from '../types';

const EXEMPLAR_ID = 'typescript/ts-audit-deps';
/** Shorter sentences ("Use it.") repeat by chance. */
const MIN_REPEAT_WORDS = 4;

const sentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+/)
    .map(s =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim(),
    )
    .filter(s => s.split(' ').length >= MIN_REPEAT_WORDS);

/** The first `whenToUse` sentence that is also a `description` sentence, normalized. */
export function repeatedSentence(description: string, whenToUse: string): string | undefined {
  const described = new Set(sentences(description));
  return sentences(whenToUse).find(s => described.has(s));
}

/** What is wrong with one skill's `whenToUse`, one line per problem. */
function problems(frontmatter: Record<string, unknown>): string[] {
  const { whenToUse, description } = frontmatter;
  if (typeof whenToUse !== 'string' || whenToUse.trim() === '') {
    return [`no whenToUse authored at all (exemplar: ${EXEMPLAR_ID})`];
  }
  const found: string[] = [];
  const repeated =
    typeof description === 'string' ? repeatedSentence(description, whenToUse) : undefined;
  if (repeated) found.push(`whenToUse repeats a description sentence ("${repeated}"): say it once`);
  if (!whenToUse.includes('"')) {
    found.push(`whenToUse has no quoted trigger phrases (exemplar: ${EXEMPLAR_ID})`);
  }
  return found;
}

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  return ctx.catalog.artifacts
    .filter(artifact => artifact.kind === 'skill')
    .flatMap(artifact =>
      problems(artifact.frontmatter).map(detail => ({
        ruleId: 'when-to-use-quality',
        severity: 'warning' as const,
        artifactId: artifact.id,
        filePath: artifact.filePath,
        detail,
      })),
    );
}

function editorialTask(finding: ConformanceFinding): EditorialTask | undefined {
  if (!finding.artifactId || !finding.filePath) return undefined;
  return {
    artifactId: finding.artifactId,
    filePath: finding.filePath,
    kind: 'skill',
    instruction:
      `Author or rewrite the whenToUse frontmatter field to match the shape of ${EXEMPLAR_ID}'s ` +
      'whenToUse: 2-3 concrete quoted trigger phrases a user would actually type ' +
      '(e.g. "are my dependencies up to date", "audit my deps"), followed by one sentence ' +
      'naming what it produces, followed by an explicit "Complements <sibling-id>" clause if ' +
      'a sibling skill/agent handles an adjacent but distinct concern. Do not change what the ' +
      'skill does — only how its trigger conditions are described. Preserve the existing ' +
      'meaning; do not invent new scope.',
    ownedFields: ['whenToUse'],
  };
}

export const whenToUseQualityRule: ConformanceRule = {
  id: 'when-to-use-quality',
  title: 'whenToUse should use concrete quoted trigger phrases',
  class: 'editorial',
  appliesTo: { kinds: ['skill'] },
  rationale:
    `A terse whenToUse dispatches worse than one in the exemplar's shape (${EXEMPLAR_ID}) — ` +
    'concrete phrasing is what the model actually pattern-matches against.',
  detect,
  editorialTask,
};
