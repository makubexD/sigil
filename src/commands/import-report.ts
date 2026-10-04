/**
 * Coverage-report and cross-language-overlap rendering for `sigil import`.
 * Split out of import.ts to keep that file under the repo's own module-size
 * threshold — this is presentation logic only, no I/O beyond console output.
 *
 * @module
 */
import path from 'node:path';
import { parseFrontmatter } from '../frontmatter-parse';
import type { LoadedCatalog, Target, ArtifactKind } from '../types';
import { checkSourceArtifact } from '../authoring/check-source';
import { normPath, basenameOfId } from '../paths';
import { CLI_LABEL_COL_WIDTH } from '../cli-helpers';
import { renderArtifactFile } from '../authoring/import';
import { stripLanguagePrefix } from '../authoring/import/translate';
import type { ImportPlan, ImportItem } from '../authoring/import/plan';

/**
 * Groups every catalog artifact by its language-prefix-stripped topic slug once, so
 * `computeOverlapLines` does a Map lookup per incoming item instead of a full-catalog `.filter()`
 * per item — was O(items * catalogSize); fixed as part of the 2026-08-26 round after a dogfooded
 * `ts-performance-profiler` run flagged it (docs/audits/2026-08-25/register.md's backlog).
 */
function groupArtifactsByTopic(catalog: LoadedCatalog): Map<string, LoadedCatalog['artifacts']> {
  const byTopic = new Map<string, LoadedCatalog['artifacts']>();
  for (const a of catalog.artifacts) {
    const topic = stripLanguagePrefix(
      String(a.frontmatter.name ?? basenameOfId(a.id)),
      String(a.frontmatter.language ?? ''),
    );
    const group = byTopic.get(topic) ?? [];
    byTopic.set(topic, group);
    group.push(a);
  }
  return byTopic;
}

/**
 * For each incoming artifact, strip the language prefix from its slug and check
 * for same-topic artifacts in other languages in the existing catalog.
 */
export function computeOverlapLines(
  plan: ImportPlan,
  catalog: LoadedCatalog,
  lang: string,
): string[] {
  const byTopic = groupArtifactsByTopic(catalog);
  const overlapLines: string[] = [];
  for (const item of plan.items) {
    const topic = stripLanguagePrefix(basenameOfId(item.frontmatter.id), lang);
    const matches = (byTopic.get(topic) ?? []).filter(
      a => (a.frontmatter.language as string | undefined) !== lang,
    );
    if (matches.length > 0) {
      overlapLines.push(`  ${item.frontmatter.id}  ←→  ${matches.map(m => m.id).join(', ')}`);
    }
  }
  return overlapLines;
}

/** Prints the rendered frontmatter block's lines, indented for the dry-run preview. */
function printRenderedFrontmatter(rendered: string): void {
  const frontmatterMatch = rendered.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return;
  for (const line of (frontmatterMatch[1] ?? '').split('\n')) {
    console.log(`    ${line}`);
  }
}

/** Validates the rendered artifact and prints any violations (same checks as execute.ts). */
function printRenderedValidation(
  rendered: string,
  destPath: string,
  catalog: LoadedCatalog,
  targets: Target[],
): void {
  const parsed = parseFrontmatter(rendered);
  const fm = parsed.data as Record<string, unknown>;
  const virtArtifact = {
    id: fm.id as string,
    kind: fm.kind as ArtifactKind,
    filePath: destPath,
    frontmatter: fm,
    body: parsed.content.trim(),
  };
  const violations = checkSourceArtifact(virtArtifact, catalog, targets);
  for (const v of violations) {
    console.log(`    ✗ validation: ${v.problem}`);
  }
}

function printDryRunPreview(item: ImportItem, catalog: LoadedCatalog, targets: Target[]): void {
  const rendered = renderArtifactFile(item.frontmatter, item.body);
  printRenderedFrontmatter(rendered);
  printRenderedValidation(rendered, item.destPath, catalog, targets);
}

/** Parameters for {@link printCoverageReport}. */
export interface PrintCoverageReportOptions {
  plan: ImportPlan;
  catalogDir: string;
  dryRun: boolean;
  catalog: LoadedCatalog;
  targets: Target[];
}

/** Prints one item's coverage line (flag + paths + warnings), plus its dry-run preview if requested. */
function printCoverageItem(
  item: ImportItem,
  options: Pick<PrintCoverageReportOptions, 'catalogDir' | 'dryRun' | 'catalog' | 'targets'>,
): void {
  const { catalogDir, dryRun, catalog, targets } = options;
  const flag = item.conflicts ? '⚠ conflict' : '＋ new';
  const relDest = normPath(path.relative(catalogDir, item.destPath));
  const descWarn = item.descriptionSynthesized ? '  ⚠ generic description' : '';
  console.log(
    `  ${flag.padEnd(CLI_LABEL_COL_WIDTH)} ${item.relativePath}  →  catalog/${relDest}${descWarn}`,
  );
  if (dryRun) printDryRunPreview(item, catalog, targets);
  if (item.droppedFields.length > 0) {
    console.log(`    dropped source fields: ${item.droppedFields.join(', ')}`);
  }
}

/** Prints the per-item coverage report (new/conflict flag, dry-run preview, dropped fields). */
export function printCoverageReport(options: PrintCoverageReportOptions): void {
  const { plan } = options;
  console.log('\n── Coverage report ─────────────────────────────────────────────────────');
  for (const item of plan.items) {
    printCoverageItem(item, options);
  }

  if (plan.droppedFieldsSummary.length > 0) {
    console.log('\n  ℹ  Some source frontmatter fields had no catalog mapping (see above).');
    console.log('     These fields are intentionally not carried over to the catalog format.');
  }
}
