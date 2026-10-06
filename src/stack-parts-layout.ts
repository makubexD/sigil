/**
 * Where stack text may live (docs/decisions/catalog-layout-standard-2026-10.md): `shared/` holds
 * only language-neutral text, so a shared skill's per-stack text is a stack part in the language
 * that owns the stack, `languages/<home>/stack-parts/<skill>.md`, where `home` is the stack's
 * `home` in `catalog/standard.yaml`. `catalog-layout` reports these problems; the loader puts the
 * parts back into the skill (load-references.ts).
 *
 * @module
 */
import path from 'node:path';
import type { Artifact, LanguageMetadata } from './types';
import type { CatalogStandard } from './catalog-standard';
import { STANDARD_FILE } from './catalog-standard';
import { LANGUAGES_DIR, SHARED_NAMESPACE } from './catalog-layout';
import { STACK_PARTS_DIR, stackPartsBySkill, type StackPart } from './load-references';

const STACK_FILE_RE = /^stack-(.+)\.md$/;

const partPath = (language: string, skill: string) =>
  `${LANGUAGES_DIR}/${language}/${STACK_PARTS_DIR}/${skill}.md`;

/** A shared skill that keeps a stack file in its own references/ folder instead of a part. */
export function sharedStackFileProblems(skill: Artifact, standard: CatalogStandard): string[] {
  if (skill.kind !== 'skill' || !skill.id.startsWith(`${SHARED_NAMESPACE}/`)) return [];
  const ownDir = path.join(path.dirname(skill.filePath), 'references');
  const skillName = path.basename(path.dirname(skill.filePath));
  return (skill.references ?? []).flatMap(ref => {
    const stack = STACK_FILE_RE.exec(ref.name)?.[1];
    const own = !ref.sourcePath || path.dirname(ref.sourcePath) === ownDir;
    if (!stack || !own) return [];
    const home = standard.stacks.find(s => s.id === stack)?.home ?? '<home>';
    return [
      `references/${ref.name}: stack text lives in ${partPath(home, skillName)}, not ${SHARED_NAMESPACE}/`,
    ];
  });
}

/** A stack whose `home` is not a language with that stack. */
function homeProblems(
  standard: CatalogStandard,
  languages: ReadonlyMap<string, LanguageMetadata>,
): string[] {
  return standard.stacks.flatMap(stack => {
    if (!stack.home) return [];
    const home = languages.get(stack.home);
    if (!home)
      return [`${STANDARD_FILE}: stack '${stack.id}' has home '${stack.home}', not a language`];
    if (home.stack === stack.id) return [];
    return [
      `${STANDARD_FILE}: stack '${stack.id}' has home '${stack.home}', whose stack is '${home.stack ?? 'none'}'`,
    ];
  });
}

/** A part naming no shared skill, or sitting outside its stack's home. */
function partProblems(
  skill: string,
  parts: readonly StackPart[],
  standard: CatalogStandard,
  sharedSkills: ReadonlySet<string>,
): string[] {
  return parts.flatMap(part => {
    const where = partPath(part.language, skill);
    if (!sharedSkills.has(skill)) return [`${where}: no shared skill is named '${skill}'`];
    const home = standard.stacks.find(s => s.id === part.stack)?.home;
    if (!home) return [`${where}: stack '${part.stack}' declares no home in ${STANDARD_FILE}`];
    if (home === part.language) return [];
    return [`${where}: the ${part.stack} stack's text lives in ${partPath(home, skill)}`];
  });
}

/** Catalog-wide stack-part problems: every part, and each stack's declared home. */
export function stackPartProblems(
  root: string,
  languages: ReadonlyMap<string, LanguageMetadata>,
  artifacts: readonly Artifact[],
  standard: CatalogStandard,
): string[] {
  const sharedSkills = new Set(
    artifacts
      .filter(a => a.kind === 'skill' && a.id.startsWith(`${SHARED_NAMESPACE}/`))
      .map(a => path.basename(path.dirname(a.filePath))),
  );
  const { parts } = stackPartsBySkill(root, languages);
  return [
    ...homeProblems(standard, languages),
    ...[...parts].flatMap(([skill, list]) => partProblems(skill, list, standard, sharedSkills)),
  ];
}
