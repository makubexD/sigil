/**
 * Execute an ImportPlan — write catalog artifact files.
 *
 * Write path:
 *   1. Partition items into new vs conflicting (by disk existence).
 *   2. With --overwrite=true, all items are written. Without it, conflicts are skipped.
 *   3. Ensure parent directories exist before writing.
 *   4. Run checkSourceArtifact on each written file (schema + conventions).
 *   5. Return a summary with per-file results.
 */
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { checkSourceArtifact } from '../check-source';
import { renderArtifactFile } from './plan';
import type { ImportItem } from './plan';
import type { LoadedCatalog, Target } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImportFileResult {
  relativePath: string;
  destPath: string;
  status: 'written' | 'skipped-conflict' | 'error';
  violations: string[];
}

export interface ExecuteResult {
  written: number;
  skipped: number;
  errors: number;
  fileResults: ImportFileResult[];
}

// ─── Helper: build a LoadedCatalog entry from rendered content (in memory) ────

function makeArtifactFromContent(
  content: string,
  filePath: string,
): import('../../types').Artifact {
  const parsed = matter(content);
  const fm = parsed.data as Record<string, unknown>;
  return {
    id: fm.id as string,
    kind: fm.kind as import('../../types').ArtifactKind,
    filePath,
    frontmatter: fm,
    body: parsed.content.trim(),
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface ExecuteOptions {
  overwrite?: boolean;
}

/**
 * Write all planned import items to the catalog directory.
 *
 * @param items       The import items from BuildImportPlan
 * @param catalog     The current loaded catalog (used for reference-integrity checks)
 * @param targets     All registered targets (used by checkSourceArtifact)
 * @param opts        Execution options
 */
export function executeImport(
  items: ImportItem[],
  catalog: LoadedCatalog,
  targets: Target[],
  opts: ExecuteOptions = {},
): ExecuteResult {
  let written = 0;
  let skipped = 0;
  let errors = 0;
  const fileResults: ImportFileResult[] = [];

  for (const item of items) {
    // Conflict check
    if (item.conflicts && !opts.overwrite) {
      skipped++;
      fileResults.push({
        relativePath: item.relativePath,
        destPath: item.destPath,
        status: 'skipped-conflict',
        violations: [],
      });
      continue;
    }

    try {
      // Render content in memory and validate BEFORE touching disk.
      // Any schema/convention violation aborts this item without writing.
      const content = renderArtifactFile(item.frontmatter, item.body);
      const artifact = makeArtifactFromContent(content, item.destPath);
      const violations = checkSourceArtifact(artifact, catalog, targets);

      if (violations.length > 0) {
        errors++;
        fileResults.push({
          relativePath: item.relativePath,
          destPath: item.destPath,
          status: 'error',
          violations: violations.map(v => v.problem),
        });
        continue;
      }

      // Validation passed — now write to disk.
      fs.mkdirSync(path.dirname(item.destPath), { recursive: true });
      fs.writeFileSync(item.destPath, content, 'utf-8');
      written++;
      fileResults.push({
        relativePath: item.relativePath,
        destPath: item.destPath,
        status: 'written',
        violations: [],
      });
    } catch (err) {
      errors++;
      fileResults.push({
        relativePath: item.relativePath,
        destPath: item.destPath,
        status: 'error',
        violations: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  return { written, skipped, errors, fileResults };
}
