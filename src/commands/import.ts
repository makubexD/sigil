/**
 * `sigil import <source-dir>` command — import a portable Claude template directory.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 * Replaces the inline `await import('gray-matter')` with a top-level static import.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog } from '../load';
import { getAllTargets } from '../targets';
import { SigilError } from '../errors';
import { normPath } from '../paths';
import {
  discoverFiles,
  buildImportPlan,
  languageYamlPath,
  executeImport,
} from '../authoring/import';
import { resolveDisplayName, maybeCreateLanguageYaml } from './import-language';
import { computeOverlapLines, printCoverageReport } from './import-report';
import { SHARED_NAMESPACE } from '../catalog-layout';

export interface ImportOptions {
  /** Target language; exactly one of `language` and `shared` is given. */
  language?: string | undefined;
  /** Import into catalog/shared/ with no `language:`. */
  shared?: boolean | undefined;
  displayName?: string | undefined;
  catalogDir: string;
  dryRun: boolean;
  yes: boolean;
  overwrite: boolean;
  createLanguage: boolean;
}

/** Prints the discovery report (found/unrecognised counts + reasons). */
function printDiscoveryReport(
  discovered: unknown[],
  unrecognised: Array<{ relativePath: string; reason: string }>,
): void {
  console.log(`  Found ${discovered.length} artifact(s)  (${unrecognised.length} unrecognised)`);
  if (unrecognised.length > 0) {
    console.log('\n  ⚠  Unrecognised files (not imported):');
    for (const u of unrecognised) {
      console.log(`     ${u.relativePath}  — ${u.reason}`);
    }
  }
}

/** The namespace to import into: --shared or --language <lang>, exactly one. */
function resolveNamespace(opts: ImportOptions): string {
  if (Boolean(opts.shared) === Boolean(opts.language)) {
    throw new SigilError('Pass exactly one of --language <lang> and --shared.', {
      hint: '  --language imports into catalog/languages/<lang>/; --shared into catalog/shared/.',
    });
  }
  return opts.shared ? SHARED_NAMESPACE : opts.language!;
}

/** Ensures the target language.yaml exists (when --create-language was passed) and resolves its display name. */
function resolveLanguageMeta(opts: ImportOptions): { lang: string; displayName: string } {
  const lang = resolveNamespace(opts);
  if (lang === SHARED_NAMESPACE) return { lang, displayName: '' };
  const yamlPath = languageYamlPath(lang, opts.catalogDir);
  const displayName = resolveDisplayName(lang, opts.displayName, yamlPath);
  if (opts.createLanguage) {
    maybeCreateLanguageYaml(lang, yamlPath, opts.displayName, displayName);
  }
  return { lang, displayName };
}

/** Prints the synthesized-description warning and cross-language overlap lines, if any. */
function printOverlapAndSynthesizedWarnings(
  plan: ReturnType<typeof buildImportPlan>,
  overlapLines: string[],
): void {
  const synthesized = plan.items.filter(i => i.descriptionSynthesized);
  if (synthesized.length > 0) {
    console.log(
      `\n  ⚠  ${synthesized.length} artifact(s) have synthesized descriptions — refine with \`sigil patch <id> --description "…"\``,
    );
  }
  if (overlapLines.length > 0) {
    console.log('\n── Cross-language overlaps ──────────────────────────────────────────────');
    console.log('  Same-topic artifacts already exist in other languages:');
    for (const l of overlapLines) console.log(l);
  }
}

/** Prints the pre-write summary: synthesized-description warning, cross-language overlaps, counts. */
function printPreImportSummary(
  plan: ReturnType<typeof buildImportPlan>,
  catalog: Awaited<ReturnType<typeof loadCatalog>>,
  lang: string,
  discoveredCount: number,
): void {
  printOverlapAndSynthesizedWarnings(plan, computeOverlapLines(plan, catalog, lang));
  const conflicts = plan.items.filter(i => i.conflicts);
  const newItems = plan.items.filter(i => !i.conflicts);
  console.log(
    `\n  Summary: ${discoveredCount} discovered · ${newItems.length} new · ${conflicts.length} conflict(s)`,
  );
}

/** Prints the per-file import results and the final written/skipped/error tally. */
function printImportResults(result: ReturnType<typeof executeImport>, catalogDir: string): boolean {
  console.log('\n── Import results ──────────────────────────────────────────────────────');
  for (const r of result.fileResults) {
    if (r.status === 'written') {
      const relDest = normPath(path.relative(catalogDir, r.destPath));
      console.log(`  ✓ catalog/${relDest}`);
    } else if (r.status === 'skipped-conflict') {
      console.log(`  = ${r.relativePath}  (skipped — already exists; use --overwrite to replace)`);
    } else {
      console.error(`  ✗ ${r.relativePath}  — ${r.violations.join('; ')}`);
    }
  }

  const ok = result.errors === 0;
  console.log(
    `\n${ok ? '✓' : '✗'} ${result.written} written · ${result.skipped} skipped · ${result.errors} error(s)`,
  );
  return ok;
}

/** Discovers source files and builds the import plan; returns null when nothing was found. */
function discoverAndPlan(
  absSourceDir: string,
  lang: string,
  displayName: string,
  opts: ImportOptions,
): ReturnType<typeof buildImportPlan> | null {
  console.log(`\nDiscovering artifacts in: ${absSourceDir}`);
  const { discovered, unrecognised } = discoverFiles(absSourceDir);
  printDiscoveryReport(discovered, unrecognised);
  if (discovered.length === 0) {
    console.log('\nNothing to import.');
    return null;
  }
  return buildImportPlan(discovered, { language: lang, displayName, catalogDir: opts.catalogDir });
}

/** Warns about existing conflicts that will be skipped when neither --yes nor --overwrite is set. */
function warnAboutConflicts(conflictCount: number, opts: ImportOptions): void {
  if (opts.yes || conflictCount === 0 || opts.overwrite) return;
  console.log(
    `\n  ⚠  ${conflictCount} file(s) already exist. Use --overwrite to replace, or --yes to skip them.`,
  );
  console.log('  Proceeding will skip conflicts and write only new files.');
}

/** Writes the plan's items to disk and prints results; throws when any item failed. */
function writeImportPlan(
  plan: ReturnType<typeof buildImportPlan>,
  catalog: Awaited<ReturnType<typeof loadCatalog>>,
  targets: ReturnType<typeof getAllTargets>,
  opts: ImportOptions,
): void {
  warnAboutConflicts(plan.items.filter(i => i.conflicts).length, opts);
  const result = executeImport(plan.items, catalog, targets, { overwrite: opts.overwrite });
  if (!printImportResults(result, opts.catalogDir)) {
    throw new SigilError('Fix the errors above and re-run. Use sigil check <file> for details.');
  }
  console.log('\nNext steps:');
  console.log('  npm run validate   — check the full catalog reference graph');
  console.log('  npm run catalog:build — rebuild dist/');
  console.log('  sigil patch <id>   — wire uses.rules/agents deps (content refinement)');
}

export async function runImport(sourceDir: string, opts: ImportOptions): Promise<void> {
  const absSourceDir = path.resolve(sourceDir);
  if (!fs.existsSync(absSourceDir)) {
    throw new SigilError(`Source directory not found: ${absSourceDir}`);
  }

  const { lang, displayName } = resolveLanguageMeta(opts);
  const plan = discoverAndPlan(absSourceDir, lang, displayName, opts);
  if (!plan) return;

  // Load catalog early (needed for overlap report + dry-run validation)
  const catalog = await loadCatalog(opts.catalogDir);
  const targets = getAllTargets();

  printCoverageReport({ plan, catalogDir: opts.catalogDir, dryRun: opts.dryRun, catalog, targets });
  printPreImportSummary(plan, catalog, lang, plan.items.length);

  if (opts.dryRun) {
    console.log('\n[dry-run] No files written.');
    return;
  }

  writeImportPlan(plan, catalog, targets, opts);
}
