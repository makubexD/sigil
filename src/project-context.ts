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
import type { ArtifactStatus } from './manifest/types';
import { getAllTargets } from './targets';

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
  /** Number of artifacts recorded in `.sigil/manifest.json`. */
  installed: number;
  health: Record<ArtifactStatus, number>;
  /** `catalog/` plus `packs.yaml`: installs here would land inside a sigil catalog. */
  isCatalogCheckout: boolean;
  looksLikeProject: boolean;
  isHomeDir: boolean;
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
  | 'prune';

export interface Recommendation {
  action: NextAction;
  reason: string;
}

function emptyHealth(): Record<ArtifactStatus, number> {
  return { 'up-to-date': 0, outdated: 0, drifted: 0, orphaned: 0, missing: 0 };
}

export function samePath(a: string, b: string): boolean {
  const normalize = (p: string): string =>
    process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p);
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

/** Reads the manifest and classifies every entry. Never throws: an unreadable manifest is reported. */
function readHealth(
  dir: string,
  catalogIds: Set<string> | undefined,
  target: string | undefined,
): Pick<ProjectContext, 'manifestPresent' | 'installed' | 'health' | 'manifestError'> {
  const health = emptyHealth();
  const manifestPresent = fs.existsSync(path.join(dir, '.sigil', 'manifest.json'));
  try {
    // The commands act on the first detected target, so count that one: header and actions agree.
    const all = loadManifest(dir);
    const manifest = target
      ? { ...all, entries: all.entries.filter(e => e.target === target) }
      : all;
    // Without catalog ids, treat every installed id as known so nothing is called orphaned.
    const known = catalogIds ?? new Set(manifest.entries.map(e => e.id));
    for (const result of computeStatus(manifest, dir, known)) health[result.status] += 1;
    return { manifestPresent, installed: manifest.entries.length, health };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { manifestPresent, installed: 0, health, manifestError: message };
  }
}

/** Every target whose marker folder (`.claude/`, `.github/`, …) exists. Empty means none: no default. */
export function detectedTargetsIn(projectDir: string): string[] {
  return getAllTargets()
    .filter(t => (t.projectMarkers ?? []).length > 0)
    .filter(t => (t.projectMarkers ?? []).every(m => fs.existsSync(path.join(projectDir, m))))
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
    ...readHealth(projectDir, options.catalogIds, detectedTargets[0]),
    isCatalogCheckout:
      fs.existsSync(path.join(projectDir, 'catalog')) &&
      fs.existsSync(path.join(projectDir, 'packs.yaml')),
    looksLikeProject: looksLikeProject(projectDir),
    isHomeDir: samePath(projectDir, options.homeDir ?? os.homedir()),
  };
}

const HOME_REASON =
  'This is your home folder. Installing here affects every project; pick a project folder.';
const CATALOG_REASON =
  'This is a sigil catalog checkout, so installs would land inside it. Pick the project to set up.';

function folderAdvice(ctx: ProjectContext): Recommendation[] {
  let reason: string | undefined;
  if (ctx.isHomeDir) reason = HOME_REASON;
  else if (ctx.isCatalogCheckout) reason = CATALOG_REASON;
  return reason === undefined ? [] : [{ action: 'change-folder', reason }];
}

function setupAdvice(ctx: ProjectContext): Recommendation[] {
  if (ctx.installed > 0) return [];
  if (ctx.detectedTargets.length === 0) {
    const note = ctx.looksLikeProject ? '' : ' (this folder has no project files yet)';
    return [
      {
        action: 'init',
        reason: `No .claude/ or .github/ folder found. Set the project up for Claude Code or Copilot${note}.`,
      },
    ];
  }
  return [{ action: 'install', reason: 'Nothing is installed here yet.' }];
}

/** One row per problem status, in the order the menu suggests fixing them. */
const HEALTH_ADVICE: ReadonlyArray<readonly [ArtifactStatus, NextAction, string]> = [
  ['missing', 'restore', 'have deleted files'],
  ['drifted', 'status', 'were edited after install'],
  ['outdated', 'update', 'have a newer catalog version'],
  ['orphaned', 'prune', 'are gone from the catalog'],
];

function healthAdvice({ health }: ProjectContext): Recommendation[] {
  return HEALTH_ADVICE.filter(([status]) => health[status] > 0).map(([status, action, what]) => ({
    action,
    reason: `${health[status]} artifact(s) ${what}.`,
  }));
}

/** Ordered suggestions for this folder; empty when it is set up and healthy. */
export function recommendNext(ctx: ProjectContext): Recommendation[] {
  return [...folderAdvice(ctx), ...setupAdvice(ctx), ...healthAdvice(ctx)];
}
