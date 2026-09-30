/**
 * Shared CLI helper utilities used by the main CLI entry point and command modules.
 *
 * These helpers are pure functions with no Commander dependency — they can be imported
 * by src/commands/* without creating a circular dependency through cli.ts.
 *
 * @module
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { loadCatalog } from './load';
import { validateCatalog } from './validate';
import { getAllTargets, defaultTargetName } from './targets';
import type { FileMap, PacksConfig, Target } from './types';
import { SigilError } from './errors';

/**
 * Column width for the leading label in aligned CLI/wizard output lines (kind noun,
 * conflict flag, etc.) — `label.padEnd(CLI_LABEL_COL_WIDTH)` before the id/value.
 */
export const CLI_LABEL_COL_WIDTH = 12;

// ─── Package root & version ───────────────────────────────────────────────────

/**
 * The package root — the directory that contains catalog/, packs.yaml, schema/, etc.
 * Anchored to the compiled cli-helpers.js location (dist-cli/), which puts .. at the
 * package root. Consumer-project destinations (--project-dir) always stay on process.cwd().
 */
export const PKG_ROOT = path.resolve(__dirname, '..');

/** Package metadata, read once at startup. */
export const pkg = JSON.parse(fs.readFileSync(path.resolve(PKG_ROOT, 'package.json'), 'utf-8')) as {
  version: string;
  homepage?: string;
};

// ─── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Resolves a catalog-source default path against the package root.
 * Ensures --catalog-dir, --packs, and --out-dir defaults always point at
 * the installed package regardless of the caller's working directory.
 */
export function resolveDefault(relative: string): string {
  return path.resolve(PKG_ROOT, relative);
}

// ─── Catalog loading ──────────────────────────────────────────────────────────

/**
 * Load the catalog and throw a SigilError if it fails schema/reference validation.
 * Shared by `loadAndValidate` (catalog + packs) and by commands that need a valid
 * catalog but have no `--packs` flag of their own (delete/edit/patch/retarget/move/new).
 */
export async function requireValidCatalog(
  catalogDir: string,
): Promise<Awaited<ReturnType<typeof loadCatalog>>> {
  const catalog = await loadCatalog(catalogDir);
  for (const warning of catalog.skipWarnings) console.warn(warning);
  const result = validateCatalog(catalog);

  if (!result.valid) {
    const lines = result.errors.map(e => `  ✗  [${e.artifactId}] ${e.error}`);
    throw new SigilError('Catalog has validation errors. Fix them before building.', {
      hint: lines.join('\n'),
    });
  }

  return catalog;
}

/** Load and validate the catalog + packs. Throws a SigilError on validation errors. */
export async function loadAndValidate(
  catalogDir: string,
  packsFile: string,
): Promise<{ catalog: Awaited<ReturnType<typeof loadCatalog>>; packsConfig: PacksConfig }> {
  const catalog = await requireValidCatalog(catalogDir);
  const packsRaw = fs.readFileSync(packsFile, 'utf-8');
  const packsConfig = yaml.load(packsRaw, { schema: yaml.JSON_SCHEMA }) as PacksConfig;
  return { catalog, packsConfig };
}

// ─── File I/O helpers ─────────────────────────────────────────────────────────

/**
 * Resolves `relPath` under `outputDir` and throws if it escapes — defense-in-depth against a
 * malformed `FileMap` key reaching the write path (schema-level `id`/`name` regexes are the
 * primary guard; this is the second net in case a target's own path template is ever wrong).
 * See docs/decisions/catalog-benchmark-audit-2026-08-22.md F22.
 */
export function resolveContained(outputDir: string, relPath: string): string {
  const root = path.resolve(outputDir);
  const full = path.resolve(root, relPath);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new SigilError(`Refusing to write outside output directory: ${relPath}`);
  }
  return full;
}

/**
 * Writes a FileMap to outputDir, creating parent directories as needed.
 * Always overwrites — caller is responsible for calling partitionFiles first.
 */
export function writeFilesSync(files: FileMap, outputDir: string): void {
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = resolveContained(outputDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  }
}

/**
 * Partitions a FileMap into files that don't exist yet (toWrite) and files that
 * would conflict with existing content (conflicting).
 */
export function partitionFiles(
  files: FileMap,
  outputDir: string,
): { toWrite: FileMap; conflicting: FileMap } {
  const toWrite: FileMap = {};
  const conflicting: FileMap = {};

  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = resolveContained(outputDir, relPath);
    if (fs.existsSync(fullPath)) {
      conflicting[relPath] = content;
    } else {
      toWrite[relPath] = content;
    }
  }

  return { toWrite, conflicting };
}

// ─── Target detection ─────────────────────────────────────────────────────────

/** Prints the verbose "target detected via markers" line + the --target override hint. */
function logDetectedTarget(target: Target, targets: Target[]): void {
  const markerList = (target.projectMarkers ?? []).join(', ');
  console.log(`  target: ${target.name}  (${markerList} found)`);
  const names = targets.map(t => t.name).join('|');
  console.log(`  Override with --target ${names} if needed.`);
}

/** Prints the verbose "no markers matched, defaulting" line. */
function logDefaultTarget(defaultTarget: string, targets: Target[]): void {
  const markerPaths = targets.flatMap(t => t.projectMarkers ?? []).join(', ');
  console.log(
    `  target: ${defaultTarget}  (no markers found: ${markerPaths}; defaulting to ${defaultTarget})`,
  );
}

/**
 * Auto-detect the installed target by scanning each registered target's `projectMarkers`.
 * Targets are scanned in registration order (claude first, then copilot).
 * Falls back to the first registered target when no markers match.
 * Adding a new target requires no changes here — declare `projectMarkers` on the adapter.
 */
export function detectProjectTarget(
  projectDir: string,
  opts: { verbose: boolean } = { verbose: false },
): string {
  const targets = getAllTargets();
  const defaultTarget = defaultTargetName();

  for (const target of targets) {
    const markers = target.projectMarkers ?? [];
    if (markers.length === 0) continue;
    const allPresent = markers.every(m => fs.existsSync(path.join(projectDir, m)));
    if (allPresent) {
      if (opts.verbose) logDetectedTarget(target, targets);
      return target.name;
    }
  }

  if (opts.verbose) logDefaultTarget(defaultTarget, targets);
  return defaultTarget;
}
