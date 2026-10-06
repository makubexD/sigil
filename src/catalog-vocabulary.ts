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
import { SHARED_NAMESPACE } from './catalog-layout';

const STACK_FILE_ID_RE = /^stack-(.+)\.md$/;

/**
 * A frontmatter list as strings. `sync` runs before `validate`, so a single string where a list
 * belongs is read as a one-item list, and anything else as none, instead of crashing the check.
 */
function stringList(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * A shared rule extended by two rules of one language is prepended to both, so that language loads
 * it twice (the clean-code baseline came through both `*-conventions` and `*-code-quality`).
 */
export function doubleExtendsProblems(artifacts: readonly Artifact[]): string[] {
  const extenders = new Map<string, string[]>();
  for (const artifact of artifacts) {
    const language = artifact.id.split('/')[0] ?? '';
    if (artifact.kind !== 'rule' || language === SHARED_NAMESPACE) continue;
    for (const base of stringList(artifact.frontmatter.extends)) {
      const key = `${language}\u0000${base}`;
      extenders.set(key, [...(extenders.get(key) ?? []), artifact.id]);
    }
  }
  return [...extenders.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => {
      const [language, base] = key.split('\u0000');
      return `${base} is extended by ${ids.sort().join(' and ')}, so ${language} loads it twice; keep one`;
    });
}

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

/**
 * A language rule glob that does not start with a double-star segment matches only at the repository
 * root, so a nested project in a monorepo (`apps/web/package.json`) never gets the rule. The
 * double-star form matches the root too.
 */
function globProblems(
  artifact: Artifact,
  languages: ReadonlyMap<string, LanguageMetadata>,
): string[] {
  const namespace = artifact.id.split('/')[0] ?? '';
  if (artifact.kind !== 'rule' || !languages.has(namespace)) return [];
  return stringList(artifact.frontmatter.appliesTo)
    .filter(glob => !glob.startsWith('**/'))
    .map(glob => `appliesTo '${glob}' matches only at the root; start it with **/`);
}

/** Whether `text` has `name` as a whole word, in any case: React is not in "reactive". */
function namesWord(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, 'i').test(text);
}

/** The names a description may use for a language: its id and each part of its display name. */
export function languageNames(lang: LanguageMetadata): string[] {
  return [lang.id, ...lang.displayName.split('/').map(part => part.trim())].filter(Boolean);
}

/**
 * A language artifact whose description never names its language competes with its siblings in
 * a repository that installs two languages (`ts-generate-tests` against `py-generate-tests`): the
 * description is what an AI dispatches on.
 */
function descriptionProblems(
  artifact: Artifact,
  languages: ReadonlyMap<string, LanguageMetadata>,
): string[] {
  const lang = languages.get(artifact.id.split('/')[0] ?? '');
  if (!lang) return [];
  const names = languageNames(lang);
  const description = String(artifact.frontmatter.description ?? '');
  if (names.some(name => namesWord(description, name))) return [];
  return [`description does not name its language (${names.join(', ')})`];
}

/** An artifact's name off its language's prefix, root-only rule globs, undeclared stacks. */
export function vocabularyProblems(
  artifact: Artifact,
  languages: ReadonlyMap<string, LanguageMetadata>,
  standard: CatalogStandard,
): string[] {
  return [
    ...prefixProblems(artifact, languages),
    ...descriptionProblems(artifact, languages),
    ...globProblems(artifact, languages),
    ...stackFileProblems(artifact, standard),
  ];
}
