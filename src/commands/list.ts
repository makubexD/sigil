/**
 * `sigil list` command — list catalog artifacts with optional filters.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 *
 * @module
 */
import { loadCatalog } from '../load';
import type { Artifact } from '../types';

export interface ListOptions {
  language?: string | undefined;
  kind?: string | undefined;
  catalogDir: string;
}

export async function runList(opts: ListOptions): Promise<void> {
  const catalog = await loadCatalog(opts.catalogDir);

  let artifacts = catalog.artifacts;
  if (opts.language) {
    artifacts = artifacts.filter(
      a => (a.frontmatter.language as string | undefined) === opts.language,
    );
  }
  if (opts.kind) {
    artifacts = artifacts.filter(a => a.kind === opts.kind);
  }

  if (artifacts.length === 0) {
    console.log('No artifacts match the given filters.');
    return;
  }

  // Group by kind for organized output.
  const byKind = new Map<string, Artifact[]>();
  for (const a of artifacts) {
    const list = byKind.get(a.kind) ?? [];
    list.push(a);
    byKind.set(a.kind, list);
  }

  // `list` runs without a chosen target so it intentionally shows neutral catalog-kind
  // names (SKILL, AGENT, RULE, PROMPT) — not platform-specific terms like "command".
  for (const [kind, list] of byKind) {
    console.log(`\n${kind.toUpperCase()} (${list.length})`);
    for (const a of list) {
      const lang = a.frontmatter.language as string | undefined;
      const langTag = lang ? ` [${lang}]` : '';
      console.log(`  ${a.id}${langTag} — ${a.frontmatter.description}`);
    }
  }
}
