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
import { getAllTargets } from './targets';
import type { FileMap, PacksConfig } from './types';
import { CLAUDE_MCP_SERVERS_KEY } from './targets/claude-code/config';
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
 * Load and validate the catalog + packs. Exits the process on validation errors.
 */
export async function loadAndValidate(
  catalogDir: string,
  packsFile: string,
): Promise<{ catalog: Awaited<ReturnType<typeof loadCatalog>>; packsConfig: PacksConfig }> {
  const catalog = await loadCatalog(catalogDir);
  const result = validateCatalog(catalog);

  if (!result.valid) {
    const lines = result.errors.map(e => `  ✗  [${e.artifactId}] ${e.error}`);
    throw new SigilError('Catalog has validation errors. Fix them before building.', {
      hint: lines.join('\n'),
    });
  }

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
  const defaultTarget = targets[0]?.name ?? 'claude';

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

// ─── Display helpers ──────────────────────────────────────────────────────────

/**
 * Derives the in-file JSON key-path where a config merge op's fragment lands, for display only.
 * Returns e.g. 'projects › /abs/path › mcpServers' (Claude mcp local scope),
 * 'mcpServers' (Claude mcp user/project), 'servers' (Copilot mcp), or undefined for non-mcp ops.
 * Drives the section suffix in dry-run preview and merged-confirmation lines so the output
 * mirrors what the scope-menu hint showed the user before they confirmed.
 */
export function mergeOpSection(
  fragment: Record<string, unknown>,
  kind: string,
): string | undefined {
  if (kind !== 'mcp') return undefined;
  const keys = Object.keys(fragment);
  if (keys.length !== 1) return undefined;
  const topKey = keys[0];
  if (topKey === 'projects') {
    // local mcp: { projects: { <absProjectDir>: { mcpServers: {…} } } }
    const inner = fragment[topKey] as Record<string, unknown>;
    const dirKey = Object.keys(inner)[0];
    return dirKey
      ? `projects › ${dirKey} › ${CLAUDE_MCP_SERVERS_KEY}`
      : `projects › … › ${CLAUDE_MCP_SERVERS_KEY}`;
  }
  // user/project mcp (CLAUDE_MCP_SERVERS_KEY) or Copilot mcp ('servers') — top key IS the section
  return topKey;
}
