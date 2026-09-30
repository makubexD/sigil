/**
 * `sigil search <query>` command — free-text search over the catalog.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 *
 * @module
 */
import { loadCatalog } from '../load';
import { resolveCatalog } from '../resolve';
import { searchArtifacts, formatSearchResults } from '../query';
import { JSON_INDENT } from '../json-util';

export interface SearchOptions {
  catalogDir: string;
  kind?: string | undefined;
  language?: string | undefined;
  tag?: string | undefined;
  json: boolean;
}

function printJsonResults(results: ReturnType<typeof searchArtifacts>): void {
  console.log(
    JSON.stringify(
      results.map(r => ({
        id: r.artifact.id,
        kind: r.artifact.kind,
        title: r.artifact.frontmatter.title,
        description: r.artifact.frontmatter.description,
        score: r.score,
        matchedFields: r.matchedFields,
      })),
      null,
      JSON_INDENT,
    ),
  );
}

export async function runSearch(query: string, opts: SearchOptions): Promise<void> {
  const catalog = await loadCatalog(opts.catalogDir);
  const resolved = resolveCatalog(catalog);

  const results = searchArtifacts(resolved, query, {
    kind: opts.kind,
    language: opts.language,
    tag: opts.tag,
  });

  if (opts.json) {
    printJsonResults(results);
    return;
  }

  console.log(formatSearchResults(results, query).join('\n'));
}
