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
import { parseFrontmatter } from '../../frontmatter-parse';
import { checkSourceArtifact } from '../check-source';
import { scanContent } from '../../trust/scan';
import { renderArtifactFile } from './plan';
import { resolveContained } from '../../cli-helpers';
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
  const parsed = parseFrontmatter(content);
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
 * Trust-scans rendered import content before it ever reaches disk. `sigil import` brings in
 * externally-authored artifacts — the one real boundary where untrusted content enters the
 * catalog — yet until the 2026-08-23 round-4 audit (F30) the trust scanner's only production
 * call site was `sigil check --trust`, a separate, opt-in command run against files already
 * inside the catalog. An imported artifact could carry a secret or an injection payload and
 * land in `catalog/` with zero scan. Error-level findings block the write unconditionally (no
 * `--trust`/`--strict` opt-in here, unlike `check`) — import is exactly the boundary the scanner
 * exists for. Warn-level findings are reported but do not block, matching `check`'s own default.
 */
function scanImportContent(content: string, destPath: string): string[] {
  const scanResult = scanContent(destPath, content);
  if (scanResult.level !== 'error') return [];
  return scanResult.findings.map(f => `[trust] ${f.rule} (line ${f.line}): ${f.snippet}`);
}

/** Renders content and validates it against the catalog; throws-free — returns violations. */
function renderAndValidate(
  item: ImportItem,
  catalog: LoadedCatalog,
  targets: Target[],
): { content: string; violations: string[] } {
  const content = renderArtifactFile(item.frontmatter, item.body);
  const artifact = makeArtifactFromContent(content, item.destPath);
  const violations = checkSourceArtifact(artifact, catalog, targets);
  const trustViolations = [
    ...scanImportContent(content, item.destPath),
    ...(item.references ?? []).flatMap(ref =>
      scanImportContent(ref.content, referencePath(item.destPath, ref.name)),
    ),
    ...(item.stackParts ?? []).flatMap(part => scanImportContent(part.content, part.destPath)),
  ];
  return { content, violations: [...violations.map(v => v.problem), ...trustViolations] };
}

/** Where a skill's reference file lands: beside its SKILL.md, contained in references/. */
function referencePath(skillPath: string, name: string): string {
  return resolveContained(path.join(path.dirname(skillPath), 'references'), name);
}

/** Refuses to write through a symbolic link already sitting at a destination in the catalog. */
function assertNoLinkAt(destPath: string): void {
  if (fs.lstatSync(destPath, { throwIfNoEntry: false })?.isSymbolicLink()) {
    throw new Error(`${destPath} is a symbolic link in the catalog; refusing to write through it`);
  }
}

/** Writes rendered content (and a skill's references) to disk, creating directories as needed. */
function writeItemToDisk(item: ImportItem, content: string): void {
  const writes = [
    { file: item.destPath, content },
    ...(item.references ?? []).map(ref => ({
      file: referencePath(item.destPath, ref.name),
      content: ref.content,
    })),
    ...(item.stackParts ?? []).map(part => ({ file: part.destPath, content: part.content })),
  ];
  writes.forEach(w => assertNoLinkAt(w.file));
  for (const w of writes) {
    fs.mkdirSync(path.dirname(w.file), { recursive: true });
    fs.writeFileSync(w.file, w.content, 'utf-8');
  }
}

/** Renders, validates, and (if valid) writes one item; never throws — errors become violations. */
function tryWriteImportItem(
  item: ImportItem,
  catalog: LoadedCatalog,
  targets: Target[],
): { status: 'written' | 'error'; violations: string[] } {
  try {
    // Render content in memory and validate BEFORE touching disk.
    // Any schema/convention violation aborts this item without writing.
    const { content, violations } = renderAndValidate(item, catalog, targets);
    if (violations.length > 0) return { status: 'error', violations };
    writeItemToDisk(item, content);
    return { status: 'written', violations: [] };
  } catch (err) {
    return { status: 'error', violations: [err instanceof Error ? err.message : String(err)] };
  }
}

/** Renders + validates one item; writes to disk only when validation passes. */
function writeOneImportItem(
  item: ImportItem,
  catalog: LoadedCatalog,
  targets: Target[],
): ImportFileResult {
  const { status, violations } = tryWriteImportItem(item, catalog, targets);
  return { relativePath: item.relativePath, destPath: item.destPath, status, violations };
}

/** Processes one import item: skip on conflict (without --overwrite), else render+write. */
function processImportItem(
  item: ImportItem,
  catalog: LoadedCatalog,
  targets: Target[],
  overwrite: boolean | undefined,
): ImportFileResult {
  if (item.conflicts && !overwrite) {
    return {
      relativePath: item.relativePath,
      destPath: item.destPath,
      status: 'skipped-conflict',
      violations: [],
    };
  }
  return writeOneImportItem(item, catalog, targets);
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
  const fileResults = items.map(item => processImportItem(item, catalog, targets, opts.overwrite));

  return {
    written: fileResults.filter(r => r.status === 'written').length,
    skipped: fileResults.filter(r => r.status === 'skipped-conflict').length,
    errors: fileResults.filter(r => r.status === 'error').length,
    fileResults,
  };
}
