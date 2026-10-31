/**
 * Low-level string helpers shared by the per-kind translators in translate-kinds.ts.
 * Split out of translate.ts to keep that file under the repo's own module-size threshold.
 *
 * @module
 */
import { stripLanguagePrefix } from './translate-shared';

/**
 * Split a tools field into a string array.
 *
 * Accepts a comma string ("Read, Grep"), a YAML list (['Read', 'Grep']), or a
 * bracketed string that a tolerant parser left as text ('["Read", "Grep"]').
 */
export function splitToolsString(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is string => typeof item === 'string')
      .map(item => item.trim())
      .filter(Boolean);
  }
  if (typeof raw !== 'string') return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return splitCommaList(trimmed.slice(1, -1), true);
  }
  return splitCommaList(raw, false);
}

/** Split on commas, optionally stripping one matching quote layer from each item. */
function splitCommaList(raw: string, stripQuotes: boolean): string[] {
  return raw
    .split(',')
    .map(item => (stripQuotes ? stripOneQuoteLayer(item) : item.trim()))
    .filter(Boolean);
}

/** Trim an item and remove a matching pair of surrounding single or double quotes. */
function stripOneQuoteLayer(item: string): string {
  const trimmed = item.trim();
  const first = trimmed[0];
  const quoted = trimmed.length > 1 && (first === '"' || first === "'") && trimmed.endsWith(first);
  return quoted ? trimmed.slice(1, -1).trim() : trimmed;
}

/**
 * Derive tags from the slug (strip canonical language prefix, split on hyphen, add language tag).
 *
 * cs-generate-tests, language=csharp → ['csharp', 'generate', 'tests']
 */
export function tagsFromSlug(slug: string, language: string, prefix?: string): string[] {
  const withoutPrefix = stripLanguagePrefix(slug, prefix);
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
