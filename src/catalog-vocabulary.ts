/**
 * One vocabulary for languages and stacks (docs/decisions/family-skeleton-standard-2026-10.md):
 * each `language.yaml` names its artifact-name `prefix` and its `stack`, and every stack is
 * declared once in `catalog/standard.yaml`. `catalog-layout` reports these problems; consumer
 * commands never read them.
 *
 * @module
 */
import type { Artifact, LanguageMetadata } from './types';
import type { CatalogStandard } from './catalog-standard';
import { STANDARD_FILE } from './catalog-standard';

const STACK_FILE_ID_RE = /^stack-(.+)\.md$/;

/** Problems with the languages themselves: a missing prefix or stack, an unknown stack, a shared prefix. */
export function languageProblems(
  languages: ReadonlyMap<string, LanguageMetadata>,
  standard: CatalogStandard,
): string[] {
  const stacks = new Set(standard.stacks.map(s => s.id));
  const prefixOwner = new Map<string, string>();
  return [...languages.values()].flatMap(lang => {
    const where = `languages/${lang.id}/language.yaml`;
    const problems: string[] = [];
    if (!lang.prefix) problems.push(`${where} declares no prefix`);
    if (!lang.stack) problems.push(`${where} declares no stack`);
    else if (!stacks.has(lang.stack)) {
      problems.push(`${where}: stack '${lang.stack}' is not declared in ${STANDARD_FILE}`);
    }
    const owner = lang.prefix ? prefixOwner.get(lang.prefix) : undefined;
    if (owner) problems.push(`${where}: prefix '${lang.prefix}' is already ${owner}'s`);
    if (lang.prefix && !owner) prefixOwner.set(lang.prefix, lang.id);
    return problems;
  });
}

/** A language artifact whose name does not start with its language's prefix. */
function prefixProblems(
  artifact: Artifact,
  languages: ReadonlyMap<string, LanguageMetadata>,
): string[] {
  const [namespace = '', name = ''] = artifact.id.split('/');
  const prefix = languages.get(namespace)?.prefix;
  if (!prefix || name.startsWith(`${prefix}-`)) return [];
  return [`name '${name}' does not start with the ${namespace} prefix '${prefix}-'`];
}

/** Stack files (`references/stack-<id>.md`) for a stack the standard does not declare. */
function stackFileProblems(artifact: Artifact, standard: CatalogStandard): string[] {
  const stacks = new Set(standard.stacks.map(s => s.id));
  return (artifact.references ?? []).flatMap(ref => {
    const stack = STACK_FILE_ID_RE.exec(ref.name)?.[1];
    if (!stack || stacks.has(stack)) return [];
    return [`references/${ref.name}: stack '${stack}' is not declared in ${STANDARD_FILE}`];
  });
}

/** An artifact's name off its language's prefix, and stack files for undeclared stacks. */
export function vocabularyProblems(
  artifact: Artifact,
  languages: ReadonlyMap<string, LanguageMetadata>,
  standard: CatalogStandard,
): string[] {
  return [...prefixProblems(artifact, languages), ...stackFileProblems(artifact, standard)];
}
