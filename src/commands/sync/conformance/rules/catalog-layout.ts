/**
 * `catalog-layout` — the "detect" layer of the catalog layout standard
 * (docs/decisions/catalog-layout-standard-2026-10.md). Fails `sync --check` when an artifact sits
 * where the standard says it can't:
 *   - position: outside both namespaces, an id prefix or `language:` out of step with its folder,
 *     a shared artifact naming a language, a language with no `language.yaml`, a file in another
 *     kind's folder, a skill folder named differently from the skill (catalog-layout.ts);
 *   - skill folders: content that never ships (anything besides SKILL.md and flat
 *     `references/*.md`), a reference SKILL.md never mentions, a stack file not named
 *     `stack-<stack>.md`;
 *   - vocabulary, when the catalog has `standard.yaml` (catalog-vocabulary.ts): a language without
 *     a prefix or stack, a stack not declared there, a name off its language's prefix, a language
 *     rule glob that matches only at the root, a shared rule two rules of one language extend.
 *
 * Author-only: `validateCatalog`, which gates consumer commands, is untouched. Reads paths relative
 * to the catalog root and never follows a symbolic link; a catalog built in memory has no root and
 * is skipped. No `fix()`: moving or renaming a file is the author's call.
 *
 * @module
 */
import path from 'node:path';
import type { Artifact } from '../../../../types';
import type { ConformanceRule, ConformanceFinding } from '../types';
import { positionProblems } from '../../../../catalog-layout';
import { readReferences, skillFolderExtras } from '../../../../load-references';
import { loadCatalogStandard } from '../../../../catalog-standard';
import {
  doubleExtendsProblems,
  languageProblems,
  vocabularyProblems,
} from '../../../../catalog-vocabulary';

const STACK_FILE_RE = /^stack-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

/**
 * Everything a skill folder carries that never ships — the same lists `sigil import` reports and
 * the loader warns about (load-references.ts), so the three can't disagree.
 */
function unshippedEntries(skillDir: string): string[] {
  const { skipped } = readReferences(skillDir);
  return [...skillFolderExtras(skillDir), ...skipped].map(
    s => `${path.relative(skillDir, s.path).split(path.sep).join('/')}: ${s.reason}`,
  );
}

/** Loaded references SKILL.md never names, and stack files named off the stack-<stack>.md shape. */
function referenceProblems(skill: Artifact): string[] {
  return (skill.references ?? []).flatMap(ref => {
    const problems: string[] = [];
    if (!skill.body.includes(`references/${ref.name}`)) {
      problems.push(`references/${ref.name} is never mentioned in SKILL.md, so it may never load`);
    }
    // Any name starting "stack" is treated as meant for a stack file, so "stackgo.md" or
    // "stacks.md" is caught; a reference about something else should not start with "stack".
    if (ref.name.startsWith('stack') && !STACK_FILE_RE.test(ref.name)) {
      problems.push(`references/${ref.name}: a stack file is named stack-<stack>.md`);
    }
    return problems;
  });
}

/** Every layout problem for one artifact. */
function problemsFor(artifact: Artifact, root: string, languages: Map<string, unknown>): string[] {
  const position = positionProblems(root, languages, artifact);
  if (artifact.kind !== 'skill') return position;
  return [
    ...position,
    ...unshippedEntries(path.dirname(artifact.filePath)),
    ...referenceProblems(artifact),
  ];
}

const layoutError = (detail: string, artifact?: Artifact): ConformanceFinding =>
  artifact
    ? {
        ruleId: 'catalog-layout',
        severity: 'error',
        artifactId: artifact.id,
        filePath: artifact.filePath,
        detail,
      }
    : { ruleId: 'catalog-layout', severity: 'error', detail };

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  const { catalog } = ctx;
  if (!catalog.root) return [];
  const root = catalog.root;
  const standard = loadCatalogStandard(root);
  const artifactFindings = catalog.artifacts.flatMap(artifact =>
    [
      ...problemsFor(artifact, root, catalog.languages),
      ...(standard ? vocabularyProblems(artifact, catalog.languages, standard) : []),
    ].map(detail => layoutError(detail, artifact)),
  );
  const catalogWide = standard
    ? [
        ...languageProblems(catalog.languages, standard),
        ...doubleExtendsProblems(catalog.artifacts),
      ]
    : [];
  return [...catalogWide.map(detail => layoutError(detail)), ...artifactFindings];
}

export const catalogLayoutRule: ConformanceRule = {
  id: 'catalog-layout',
  title: 'Artifacts sit where the catalog layout standard puts them',
  class: 'mechanical',
  appliesTo: {},
  rationale:
    'A misplaced artifact loads under the wrong namespace, ships with the wrong language, or ' +
    'leaves skill content behind; the layout standard is only real if CI enforces it.',
  detect,
};
