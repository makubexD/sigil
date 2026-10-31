/**
 * The one way src/ parses Markdown frontmatter. gray-matter caches parse results by content and,
 * on a cache hit, returns a shallow copy whose `data` is the cached object itself — so any caller
 * that edits `data` (move, patch, edit, sync --apply) changed what every later parse of the same
 * text returned in the same process. Passing an options object makes gray-matter skip its cache,
 * so every call here gets a fresh object. ESLint forbids importing gray-matter anywhere else.
 *
 * `parseYamlFrontmatter` is the one for untrusted source files (e.g. `sigil import`): gray-matter
 * executes the body of a `---js` block, so a raw externally-authored file must never reach it.
 *
 * @module
 */
import matter from 'gray-matter';
import yaml from 'js-yaml';
import { FORBIDDEN_KEYS, isPlainObject } from './config-merge/primitives';

/** Parses `raw` into frontmatter `data` and body `content`; never shares objects between calls. */
export function parseFrontmatter(raw: string): matter.GrayMatterFile<string> {
  return matter(raw, {});
}

/**
 * Parses YAML frontmatter from an untrusted source file without executing anything. js-yaml's
 * `JSON_SCHEMA` yields only plain JSON types. Returns undefined when the text is not valid YAML or
 * does not load as a plain mapping, so the caller can fall back to a tolerant parser; no
 * `FORBIDDEN_KEYS` key is copied.
 */
export function parseYamlFrontmatter(text: string): Record<string, unknown> | undefined {
  let parsed: unknown;
  try {
    parsed = yaml.load(text, { schema: yaml.JSON_SCHEMA });
  } catch {
    return undefined;
  }
  if (!isPlainObject(parsed)) return undefined;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!FORBIDDEN_KEYS.has(key)) result[key] = value;
  }
  return result;
}
