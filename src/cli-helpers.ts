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
import type { FileMap, PacksConfig } from './types';
import { SigilError } from './errors';

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
 * Writes a FileMap to outputDir, creating parent directories as needed.
 * Always overwrites — caller is responsible for calling partitionFiles first.
 */
export function writeFilesSync(files: FileMap, outputDir: string): void {
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(outputDir, relPath);
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
    const fullPath = path.join(outputDir, relPath);
    if (fs.existsSync(fullPath)) {
      conflicting[relPath] = content;
    } else {
      toWrite[relPath] = content;
    }
  }

  return { toWrite, conflicting };
}

// ─── Target detection ─────────────────────────────────────────────────────────

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
      if (opts.verbose) {
        const markerList = markers.join(', ');
        console.log(`  target: ${target.name}  (${markerList} found)`);
        const names = targets.map(t => t.name).join('|');
        console.log(`  Override with --target ${names} if needed.`);
      }
      return target.name;
    }
  }

  if (opts.verbose) {
    const markerPaths = targets.flatMap(t => t.projectMarkers ?? []).join(', ');
    console.log(
      `  target: ${defaultTarget}  (no markers found: ${markerPaths}; defaulting to ${defaultTarget})`,
    );
  }
  return defaultTarget;
}
