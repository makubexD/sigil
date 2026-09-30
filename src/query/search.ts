/**
 * searchArtifacts + formatSearchResults — support for the `sigil search` command.
 * Pure functions, no I/O.
 */
import type { ResolvedArtifact, ResolvedCatalog } from '../types';

// ─── Scoring weights ───────────────────────────────────────────────────────────
// Named so the ranking policy documented below is the code, not just the comment.
const SCORE_ID_EXACT = 8;
const SCORE_ID_CONTAINS = 4;
const SCORE_TITLE_CONTAINS = 4;
const SCORE_TAG_EXACT = 2;
const SCORE_TAG_CONTAINS = 1;
const SCORE_DESCRIPTION_CONTAINS = 1;

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

/** Applies the kind/language/tag pre-filters; true means the artifact should be skipped. */
function isFilteredOut(artifact: ResolvedArtifact, filters: SearchFilters): boolean {
  const fm = artifact.frontmatter;
  if (filters.kind && artifact.kind !== filters.kind) return true;
  if (filters.language) {
    const lang = fm.language as string | undefined;
    if (lang !== filters.language) return true; // includes the "shared" (undefined) case
  }
  if (filters.tag) {
    const tags = (fm.tags as string[] | undefined) ?? [];
    const tf = filters.tag.toLowerCase();
    if (!tags.some(t => t.toLowerCase().includes(tf))) return true;
  }
  return false;
}

/** One scoring contribution: points to add and the field label to record when it applies. */
interface ScoreHit {
  score: number;
  field: string;
}

function scoreId(id: string, q: string): ScoreHit | undefined {
  if (id === q) return { score: SCORE_ID_EXACT, field: 'id (exact)' };
  if (id.includes(q)) return { score: SCORE_ID_CONTAINS, field: 'id' };
  return undefined;
}

function scoreTags(tags: string[], q: string): ScoreHit | undefined {
  if (tags.some(t => t === q)) return { score: SCORE_TAG_EXACT, field: 'tag (exact)' };
  if (tags.some(t => t.includes(q))) return { score: SCORE_TAG_CONTAINS, field: 'tag' };
  return undefined;
}

/** Scores one artifact against the lowercased query; mutates nothing, returns the result or null. */
function scoreArtifact(artifact: ResolvedArtifact, q: string): SearchResult | null {
  const fm = artifact.frontmatter;
  const id = artifact.id.toLowerCase();
  const title = ((fm.title as string | undefined) ?? '').toLowerCase();
  const description = ((fm.description as string | undefined) ?? '').toLowerCase();
  const tags = ((fm.tags as string[] | undefined) ?? []).map(t => t.toLowerCase());

  const hits = [
    scoreId(id, q),
    title.includes(q) ? { score: SCORE_TITLE_CONTAINS, field: 'title' } : undefined,
    scoreTags(tags, q),
    description.includes(q)
      ? { score: SCORE_DESCRIPTION_CONTAINS, field: 'description' }
      : undefined,
  ].filter((h): h is ScoreHit => h !== undefined);

  const score = hits.reduce((sum, h) => sum + h.score, 0);
  return score > 0 ? { artifact, score, matchedFields: hits.map(h => h.field) } : null;
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

  const results = catalog.artifacts
    .filter(a => !isFilteredOut(a, filters))
    .map(a => scoreArtifact(a, q))
    .filter((r): r is SearchResult => r !== null);

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
