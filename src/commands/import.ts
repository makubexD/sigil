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
import yaml from 'js-yaml';
import matter from 'gray-matter';
import { loadCatalog } from '../load';
import { getAllTargets } from '../targets';
import { checkSourceArtifact } from '../authoring/check-source';
import { normPath, basenameOfId } from '../paths';
import { SigilError } from '../errors';
import {
  discoverFiles,
  buildImportPlan,
  renderArtifactFile,
  languageYamlPath,
  executeImport,
} from '../authoring/import';
import { stripLanguagePrefix } from '../authoring/import/translate';
import type { ArtifactKind } from '../types';

// ── Known language display names and glob patterns for built-in languages ─────
// Used by --create-language to scaffold a language.yaml when one is absent.
const LANGUAGE_DEFAULTS: Record<string, { displayName: string; globs: string[]; icon: string }> = {
  typescript: {
    displayName: 'TypeScript',
    globs: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    icon: '🔷',
  },
  angular: {
    displayName: 'Angular',
    globs: ['**/*.ts', '**/*.html', '**/*.component.ts', '**/*.directive.ts'],
    icon: '🅰️',
  },
  csharp: {
    displayName: '.NET / C#',
    globs: ['**/*.cs', '**/*.csproj', '**/*.sln', '**/*.razor', '**/*.cshtml'],
    icon: '⚙️',
  },
  python: {
    displayName: 'Python',
    globs: ['**/*.py', '**/*.pyi'],
    icon: '🐍',
  },
  react: {
    displayName: 'React',
    globs: ['**/*.tsx', '**/*.jsx', '**/*.ts', '**/*.js'],
    icon: '⚛️',
  },
};

export interface ImportOptions {
  language: string;
  displayName?: string | undefined;
  catalogDir: string;
  dryRun: boolean;
  yes: boolean;
  overwrite: boolean;
  createLanguage: boolean;
}

export async function runImport(sourceDir: string, opts: ImportOptions): Promise<void> {
  const absSourceDir = path.resolve(sourceDir);
  if (!fs.existsSync(absSourceDir)) {
    throw new SigilError(`Source directory not found: ${absSourceDir}`);
  }

  const lang = opts.language;

  // Resolve display name: flag → language.yaml → built-in defaults → capitalised lang
  let displayName: string;
  const yamlPath = languageYamlPath(lang, opts.catalogDir);
  if (opts.displayName) {
    displayName = opts.displayName;
  } else if (fs.existsSync(yamlPath)) {
    try {
      const yamlContent = yaml.load(fs.readFileSync(yamlPath, 'utf-8'), {
        schema: yaml.JSON_SCHEMA,
      }) as Record<string, unknown>;
      displayName = (yamlContent.displayName as string | undefined) ?? lang;
    } catch {
      displayName = lang;
    }
  } else if (LANGUAGE_DEFAULTS[lang]) {
    displayName = LANGUAGE_DEFAULTS[lang]!.displayName;
  } else {
    displayName = lang.charAt(0).toUpperCase() + lang.slice(1);
  }

  // ── Create language.yaml if requested ─────────────────────────────────────
  if (opts.createLanguage && !fs.existsSync(yamlPath)) {
    const defaults = LANGUAGE_DEFAULTS[lang];
    const langDir = path.dirname(yamlPath);
    fs.mkdirSync(langDir, { recursive: true });

    const globs = defaults?.globs ?? ['**/*'];
    const icon = defaults?.icon ?? '📁';
    const langYamlContent = [
      `displayName: ${JSON.stringify(opts.displayName ?? displayName)}`,
      `globs:`,
      ...globs.map(g => `  - "${g}"`),
      `icon: "${icon}"`,
      '',
    ].join('\n');
    fs.writeFileSync(yamlPath, langYamlContent, 'utf-8');
    console.log(`✓ Created: ${yamlPath}`);
  }

  // ── Discover files ──────────────────────────────────────────────────────
  console.log(`\nDiscovering artifacts in: ${absSourceDir}`);
  const { discovered, unrecognised } = discoverFiles(absSourceDir);
  console.log(`  Found ${discovered.length} artifact(s)  (${unrecognised.length} unrecognised)`);

  if (unrecognised.length > 0) {
    console.log('\n  ⚠  Unrecognised files (not imported):');
    for (const u of unrecognised) {
      console.log(`     ${u.relativePath}  — ${u.reason}`);
    }
  }

  if (discovered.length === 0) {
    console.log('\nNothing to import.');
    return;
  }

  // ── Build import plan ─────────────────────────────────────────────────────
  const plan = buildImportPlan(discovered, {
    language: lang,
    displayName,
    catalogDir: opts.catalogDir,
  });

  // ── Load catalog early (needed for overlap report + dry-run validation) ───
  const catalog = await loadCatalog(opts.catalogDir);
  const targets = getAllTargets();

  // ── Cross-language overlap report ─────────────────────────────────────────
  // For each incoming artifact, strip the language prefix from its slug and
  // check for same-topic artifacts in other languages in the existing catalog.
  const overlapLines: string[] = [];
  for (const item of plan.items) {
    const slug = basenameOfId(item.frontmatter.id);
    const topic = stripLanguagePrefix(slug, lang);
    const matches = catalog.artifacts.filter(a => {
      if ((a.frontmatter.language as string | undefined) === lang) return false;
      const aTopic = stripLanguagePrefix(
        String(a.frontmatter.name ?? basenameOfId(a.id)),
        String(a.frontmatter.language ?? ''),
      );
      return aTopic === topic;
    });
    if (matches.length > 0) {
      overlapLines.push(`  ${item.frontmatter.id}  ←→  ${matches.map(m => m.id).join(', ')}`);
    }
  }

  // ── Coverage report ───────────────────────────────────────────────────────
  const conflicts = plan.items.filter(i => i.conflicts);
  const newItems = plan.items.filter(i => !i.conflicts);
  const synthesized = plan.items.filter(i => i.descriptionSynthesized);

  console.log('\n── Coverage report ─────────────────────────────────────────────────────');
  for (const item of plan.items) {
    const flag = item.conflicts ? '⚠ conflict' : '＋ new';
    const relDest = normPath(path.relative(opts.catalogDir, item.destPath));
    const descWarn = item.descriptionSynthesized ? '  ⚠ generic description' : '';
    console.log(`  ${flag.padEnd(12)} ${item.relativePath}  →  catalog/${relDest}${descWarn}`);
    if (opts.dryRun) {
      // Print the translated frontmatter preview in dry-run mode
      const rendered = renderArtifactFile(item.frontmatter, item.body);
      const frontmatterMatch = rendered.match(/^---\n([\s\S]*?)\n---/);
      if (frontmatterMatch) {
        for (const line of (frontmatterMatch[1] ?? '').split('\n')) {
          console.log(`    ${line}`);
        }
      }
      // Validate rendered YAML in dry-run (same logic as validate-before-write in execute.ts)
      const parsed = matter(rendered);
      const fm = parsed.data as Record<string, unknown>;
      const virtArtifact = {
        id: fm.id as string,
        kind: fm.kind as ArtifactKind,
        filePath: item.destPath,
        frontmatter: fm,
        body: parsed.content.trim(),
      };
      const violations = checkSourceArtifact(virtArtifact, catalog, targets);
      if (violations.length > 0) {
        for (const v of violations) {
          console.log(`    ✗ validation: ${v.problem}`);
        }
      }
    }
    if (item.droppedFields.length > 0) {
      console.log(`    dropped source fields: ${item.droppedFields.join(', ')}`);
    }
  }

  if (plan.droppedFieldsSummary.length > 0) {
    console.log('\n  ℹ  Some source frontmatter fields had no catalog mapping (see above).');
    console.log('     These fields are intentionally not carried over to the catalog format.');
  }

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

  console.log(
    `\n  Summary: ${discovered.length} discovered · ${newItems.length} new · ${conflicts.length} conflict(s)`,
  );

  if (opts.dryRun) {
    console.log('\n[dry-run] No files written.');
    return;
  }

  // ── Confirm before writing (unless --yes) ─────────────────────────────────
  if (!opts.yes && conflicts.length > 0 && !opts.overwrite) {
    console.log(
      `\n  ⚠  ${conflicts.length} file(s) already exist. Use --overwrite to replace, or --yes to skip them.`,
    );
    console.log('  Proceeding will skip conflicts and write only new files.');
  }

  const result = executeImport(plan.items, catalog, targets, { overwrite: opts.overwrite });

  // ── Results ───────────────────────────────────────────────────────────────
  console.log('\n── Import results ──────────────────────────────────────────────────────');
  for (const r of result.fileResults) {
    if (r.status === 'written') {
      const relDest = normPath(path.relative(opts.catalogDir, r.destPath));
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

  if (!ok) {
    throw new SigilError('Fix the errors above and re-run. Use sigil check <file> for details.');
  }

  console.log('\nNext steps:');
  console.log('  npm run validate   — check the full catalog reference graph');
  console.log('  npm run catalog:build — rebuild dist/');
  console.log('  sigil patch <id>   — wire uses.rules/agents deps (content refinement)');
}
