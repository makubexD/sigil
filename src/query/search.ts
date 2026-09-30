/**
 * searchArtifacts + formatSearchResults — support for the `sigil search` command.
 * Pure functions, no I/O.
 */
import type { ResolvedArtifact, ResolvedCatalog } from '../types';

/** A single search result with its relevance score. */
export interface SearchResult {
  artifact: ResolvedArtifact;
  score: number; // higher = more relevant
  matchedFields: string[]; // which fields matched the query
}

/** Filters for the search command. */
export interface SearchFilters {
  kind?: string | undefined;
  language?: string | undefined;
  tag?: string | undefined; // single tag match (substring)
}

/**
 * Score-and-rank artifacts against a free-text query string.
 *
 * Scoring (cumulative):
 *   8 — exact id match
 *   4 — id contains query
 *   4 — title contains query
 *   2 — any tag exactly matches query
 *   1 — tag contains query
 *   1 — description contains query
 *
 * Returns results sorted by score descending, omitting score-0 entries.
 */
export function searchArtifacts(
  catalog: ResolvedCatalog,
  query: string,
  filters: SearchFilters = {},
): SearchResult[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const results: SearchResult[] = [];

  for (const artifact of catalog.artifacts) {
    const fm = artifact.frontmatter;

    // Apply kind/language/tag filters first
    if (filters.kind && artifact.kind !== filters.kind) continue;
    if (filters.language) {
      const lang = fm.language as string | undefined;
      if (lang !== filters.language && lang !== undefined) continue;
      if (lang === undefined) continue; // shared — include only when no language filter
    }
    if (filters.tag) {
      const tags = (fm.tags as string[] | undefined) ?? [];
      const tf = filters.tag.toLowerCase();
      if (!tags.some(t => t.toLowerCase().includes(tf))) continue;
    }

    const id = artifact.id.toLowerCase();
    const title = ((fm.title as string | undefined) ?? '').toLowerCase();
    const description = ((fm.description as string | undefined) ?? '').toLowerCase();
    const tags = ((fm.tags as string[] | undefined) ?? []).map(t => t.toLowerCase());

    let score = 0;
    const matchedFields: string[] = [];

    if (id === q) {
      score += 8;
      matchedFields.push('id (exact)');
    } else if (id.includes(q)) {
      score += 4;
      matchedFields.push('id');
    }

    if (title.includes(q)) {
      score += 4;
      matchedFields.push('title');
    }

    if (tags.some(t => t === q)) {
      score += 2;
      matchedFields.push('tag (exact)');
    } else if (tags.some(t => t.includes(q))) {
      score += 1;
      matchedFields.push('tag');
    }

    if (description.includes(q)) {
      score += 1;
      matchedFields.push('description');
    }

    if (score > 0) {
      results.push({ artifact, score, matchedFields });
    }
  }

  // Sort descending by score, then alphabetically by id as tiebreaker
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.artifact.id.localeCompare(b.artifact.id);
  });

  return results;
}

/**
 * Format search results for terminal output.
 * Returns an array of lines ready to join with '\n'.
 */
export function formatSearchResults(results: SearchResult[], query: string): string[] {
  if (results.length === 0) {
    return [`\n  No artifacts match '${query}'.\n`];
  }

  const lines: string[] = [''];
  lines.push(`  ${results.length} result${results.length !== 1 ? 's' : ''} for '${query}':\n`);

  for (const r of results) {
    const fm = r.artifact.frontmatter;
    const lang = (fm.language as string | undefined) ? ` [${fm.language as string}]` : '';
    const desc = (fm.description as string | undefined) ?? '';
    const tags = (fm.tags as string[] | undefined) ?? [];
    const tagStr = tags.length ? `  #${tags.join(' #')}` : '';

    lines.push(`  ${r.artifact.kind}:${r.artifact.id}${lang}`);
    lines.push(`    ${fm.title as string}  —  ${desc}`);
    if (tagStr) lines.push(`    ${tagStr}`);
    lines.push('');
  }

  return lines;
}
