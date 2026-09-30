/**
 * Low-level string helpers shared by the per-kind translators in translate-kinds.ts.
 * Split out of translate.ts to keep that file under the repo's own module-size threshold.
 *
 * @module
 */
import { stripLanguagePrefix } from './translate';

/**
 * Split a comma-string tools field into a string array.
 * Handles both "Read, Grep, Glob, Bash" and "Read,Grep" formats.
 */
export function splitToolsString(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Derive tags from the slug (strip canonical language prefix, split on hyphen, add language tag).
 *
 * cs-generate-tests, language=csharp → ['csharp', 'generate', 'tests']
 */
export function tagsFromSlug(slug: string, language: string): string[] {
  const withoutPrefix = stripLanguagePrefix(slug, language);
  const words = withoutPrefix.split('-').filter(Boolean);
  return [language, ...words];
}

/** Source frontmatter keys not present in `knownFields`, in original order. */
export function computeDroppedFields(
  sourceFm: Record<string, unknown>,
  knownFields: Set<string>,
): string[] {
  const droppedFields: string[] = [];
  for (const key of Object.keys(sourceFm)) {
    if (!knownFields.has(key)) droppedFields.push(key);
  }
  return droppedFields;
}
