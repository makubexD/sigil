/**
 * The one way src/ parses Markdown frontmatter. gray-matter caches parse results by content and,
 * on a cache hit, returns a shallow copy whose `data` is the cached object itself — so any caller
 * that edits `data` (move, patch, edit, sync --apply) changed what every later parse of the same
 * text returned in the same process. Passing an options object makes gray-matter skip its cache,
 * so every call here gets a fresh object. ESLint forbids importing gray-matter anywhere else.
 *
 * @module
 */
import matter from 'gray-matter';

/** Parses `raw` into frontmatter `data` and body `content`; never shares objects between calls. */
export function parseFrontmatter(raw: string): matter.GrayMatterFile<string> {
  return matter(raw, {});
}
