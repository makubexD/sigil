/**
 * What state is this folder in? `detectProjectContext` reads the folder sigil was started in and
 * `recommendNext` turns that into the ordered suggestions the home menu shows. Both are pure
 * (read-only filesystem access, no prompts, no output) so every state can be a test fixture.
 *
 * @module
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadManifest, computeStatus } from './manifest';
import type { ArtifactStatus, ManifestEntry } from './manifest/types';
import { getAllTargets, retiredConfigDestinationsOf } from './targets';

/** Files and folders that mark a directory as a project someone works in. */
const PROJECT_MARKERS = [
  '.git',
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'go.mod',
  'Cargo.toml',
  'pom.xml',
  'build.gradle',
  'Gemfile',
  'composer.json',
];
const PROJECT_FILE_PATTERN = /\.(csproj|sln|fsproj)$/;

export interface ProjectContext {
  projectDir: string;
  /** Every target whose marker folder exists. Empty means "none detected" — there is no default. */
  detectedTargets: string[];
  manifestPresent: boolean;
  /** Number of artifacts recorded in `.sigil/manifest.json`, across every target. */
  installed: number;
  /** The same count per target name, so a second target's installs are never hidden. */
  installedByTarget: Record<string, number>;
  health: Record<ArtifactStatus, number>;
  /** `catalog/` plus `packs.yaml`: installs here would land inside a sigil catalog. */
  isCatalogCheckout: boolean;
  looksLikeProject: boolean;
  isHomeDir: boolean;
  /** The top of a drive (`C:\`, `/`): never a project. */
  isFilesystemRoot: boolean;
  /** Set when the manifest exists but cannot be read; `installed` is then 0. */
  manifestError?: string;
}

export interface DetectOptions {
  /** Ids in the bundled catalog. Without them nothing can be classified as orphaned. */
  catalogIds?: Set<string>;
  /** Overridable so tests never depend on the real home folder. */
  homeDir?: string;
}

export type NextAction =
  | 'change-folder'
  | 'init'
  | 'install'
  | 'restore'
  | 'status'
  | 'update'
  | 'prune'
  | 'repair';

export interface Recommendation {
  action: NextAction;
  reason: string;
}

function emptyHealth(): Record<ArtifactStatus, number> {
  return { 'up-to-date': 0, outdated: 0, drifted: 0, orphaned: 0, missing: 0 };
}

/** The real location of `p`: follows links and expands Windows 8.3 short names (`KIEFER~1`). */
function canonical(p: string): string {
  const resolved = path.resolve(p);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved; // a folder that does not exist yet still compares by its path
  }
}

export function samePath(a: string, b: string): boolean {
  const normalize = (p: string): string =>
    process.platform === 'win32' ? canonical(p).toLowerCase() : canonical(p);
  return normalize(a) === normalize(b);
}

export function looksLikeProject(dir: string): boolean {
  if (PROJECT_MARKERS.some(marker => fs.existsSync(path.join(dir, marker)))) return true;
  try {
    return fs.readdirSync(dir).some(name => PROJECT_FILE_PATTERN.test(name));
  } catch {
    return false;
  }
}

function countByTarget(entries: ManifestEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of entries) counts[e.target] = (counts[e.target] ?? 0) + 1;
  return counts;
}

type Health = Pick<
  ProjectContext,
  'manifestPresent' | 'installed' | 'installedByTarget' | 'health' | 'manifestError'
>;

/** Reads the manifest and classifies every entry. Never throws: an unreadable manifest is reported. */
function readHealth(dir: string, catalogIds: Set<string> | undefined): Health {
  const health = emptyHealth();
  const manifestPresent = fs.existsSync(path.join(dir, '.sigil', 'manifest.json'));
  try {
    const manifest = loadManifest(dir);
    // Without catalog ids, treat every installed id as known so nothing is called orphaned.
    const known = catalogIds ?? new Set(manifest.entries.map(e => e.id));
    const extras = { retiredFor: retiredConfigDestinationsOf };
    for (const result of computeStatus(manifest, dir, known, extras)) health[result.status] += 1;
    const installedByTarget = countByTarget(manifest.entries);
    return { manifestPresent, installed: manifest.entries.length, installedByTarget, health };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { manifestPresent, installed: 0, installedByTarget: {}, health, manifestError: message };
  }
}

/** Every target with at least one marker (`.claude/`, `.github/prompts/`, …) present. Empty means none: no default. */
export function detectedTargetsIn(projectDir: string): string[] {
  return getAllTargets()
    .filter(t => (t.projectMarkers ?? []).some(m => fs.existsSync(path.join(projectDir, m))))
    .map(t => t.name);
}

/** Names of the tools `sigil init` can still set up: they have folders to create and none are found yet. */
export function toolsToSetUp(detected: readonly string[]): string[] {
  return getAllTargets()
    .filter(t => (t.initDirs?.length ?? 0) > 0 && !detected.includes(t.name))
    .map(t => t.name);
}

export function detectProjectContext(
  projectDir: string,
  options: DetectOptions = {},
): ProjectContext {
  const detectedTargets = detectedTargetsIn(projectDir);
  return {
    projectDir,
    detectedTargets,
    ...readHealth(projectDir, options.catalogIds),
    isCatalogCheckout:
      fs.existsSync(path.join(projectDir, 'catalog')) &&
      fs.existsSync(path.join(projectDir, 'packs.yaml')),
    looksLikeProject: looksLikeProject(projectDir),
    isHomeDir: samePath(projectDir, options.homeDir ?? os.homedir()),
    isFilesystemRoot: path.dirname(path.resolve(projectDir)) === path.resolve(projectDir),
  };
}

export { recommendNext, riskyFolderReason } from './project-advice';
