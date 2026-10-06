/**
 * Load phase: discovers and parses all catalog artifact files.
 * Returns a LoadedCatalog with raw (unvalidated, unresolved) artifacts.
 */
import fs from 'fs';
import path from 'path';
import { parseFrontmatter } from './frontmatter-parse';
import { glob, globSync } from 'tinyglobby';
import yaml from 'js-yaml';
import type { Artifact, LanguageMetadata, LoadedCatalog } from './types';
import { ALL_KINDS, sourceGlob } from './kinds';
import { loadReferences, stackPartsBySkill, type StackPart } from './load-references';
import { readRegularFile } from './safe-read';
import { LANGUAGES_DIR, SHARED_NAMESPACE } from './catalog-layout';

/** An artifact file larger than this is skipped (catalog artifacts are a few KiB). */
const KIB = 1024;
const MAX_ARTIFACT_KIB = 1024;
const MAX_ARTIFACT_BYTES = MAX_ARTIFACT_KIB * KIB;

/** One glob per kind, from KIND_REGISTRY's sourceDir/sourceSuffix (SKILL.md for skills). */
const ARTIFACT_PATTERNS = ALL_KINDS.map(sourceGlob);

/**
 * Loads every language.yaml under catalogDir's languages/ subdirectories into a langId → metadata
 * map. Synchronous so `sigil move`'s post-move check reads the same registry as loadCatalog.
 */
export function loadLanguages(catalogDir: string): Map<string, LanguageMetadata> {
  const languages = new Map<string, LanguageMetadata>();
  const langYamlPaths = globSync(`${LANGUAGES_DIR}/*/language.yaml`, {
    cwd: catalogDir,
    absolute: true,
    expandDirectories: false,
  });

  for (const yamlPath of langYamlPaths) {
    try {
      const raw = fs.readFileSync(yamlPath, 'utf-8');
      const meta = yaml.load(raw, { schema: yaml.JSON_SCHEMA }) as Omit<LanguageMetadata, 'id'>;
      const langId = path.basename(path.dirname(yamlPath));
      languages.set(langId, { id: langId, ...meta });
    } catch (err) {
      throw new Error(`[load] Failed to parse language.yaml at ${yamlPath}`, { cause: err });
    }
  }
  return languages;
}

/** Builds the id → artifact map, throwing if two artifacts declare the same id. */
function indexById(artifacts: Artifact[]): Map<string, Artifact> {
  const byId = new Map<string, Artifact>();
  for (const artifact of artifacts) {
    const existing = byId.get(artifact.id);
    if (existing) {
      throw new Error(
        `[load] Duplicate artifact id '${artifact.id}'\n` +
          `  First:  ${existing.filePath}\n` +
          `  Second: ${artifact.filePath}`,
      );
    }
    byId.set(artifact.id, artifact);
  }
  return byId;
}

/**
 * Loads the entire catalog from catalogDir and returns a flat artifact list
 * plus language metadata from each language.yaml.
 *
 * @param catalogDir - Absolute path to the catalog/ directory.
 */
export async function loadCatalog(catalogDir: string): Promise<LoadedCatalog> {
  const skipWarnings: string[] = [];
  const languages = loadLanguages(catalogDir);

  // tinyglobby and fast-glob both return paths in traversal order; sorting keeps every emitted file stable.
  const filePaths = (
    await glob(ARTIFACT_PATTERNS, {
      cwd: catalogDir,
      absolute: true,
      expandDirectories: false,
      followSymbolicLinks: false,
    })
  ).sort();
  const { parts, skipped } = stackPartsBySkill(catalogDir, languages);
  for (const s of skipped) skipWarnings.push(`[load] Skipping stack part ${s.path}: ${s.reason}`);
  const artifacts = filePaths
    .map(filePath => parseArtifactFile(filePath, skipWarnings, parts))
    .filter((a): a is Artifact => a !== null);

  const byId = indexById(artifacts);
  return { artifacts, byId, languages, skipWarnings, root: path.resolve(catalogDir) };
}

/** Checks the two frontmatter fields every artifact requires, recording a skip reason if absent. */
function missingRequiredField(
  fm: Record<string, unknown>,
  filePath: string,
  skipWarnings: string[],
): boolean {
  if (!fm.id) {
    skipWarnings.push(`[load] Skipping ${filePath}: missing 'id' in frontmatter`);
    return true;
  }
  if (!fm.kind) {
    skipWarnings.push(`[load] Skipping ${filePath}: missing 'kind' in frontmatter`);
    return true;
  }
  return false;
}

/** Builds the Artifact object once its frontmatter has passed the required-field check. */
function buildArtifact(
  filePath: string,
  fm: Record<string, unknown>,
  body: string,
  ctx: { warnings: string[]; parts: ReadonlyMap<string, StackPart[]> },
): Artifact {
  const artifact: Artifact = {
    id: fm.id as string,
    kind: fm.kind as Artifact['kind'],
    filePath,
    frontmatter: fm,
    body,
  };
  if (fm.kind === 'skill') artifact.references = skillReferences(artifact, ctx);
  return artifact;
}

/** A skill's sibling references/ files, plus a shared skill's stack parts. */
function skillReferences(
  skill: Artifact,
  ctx: { warnings: string[]; parts: ReadonlyMap<string, StackPart[]> },
) {
  const skillDir = path.dirname(skill.filePath);
  const shared = skill.id.startsWith(`${SHARED_NAMESPACE}/`);
  const parts = shared ? (ctx.parts.get(path.basename(skillDir)) ?? []) : [];
  return loadReferences(skillDir, ctx.warnings, parts);
}

/** Parses one artifact file; returns null and records a skip reason if it should be skipped. */
function parseArtifactFile(
  filePath: string,
  skipWarnings: string[],
  parts: ReadonlyMap<string, StackPart[]>,
): Artifact | null {
  const read = readRegularFile(filePath, { maxBytes: MAX_ARTIFACT_BYTES });
  if ('reason' in read) {
    skipWarnings.push(`[load] Skipping ${filePath}: ${read.reason}`);
    return null;
  }

  const parsed = parseFrontmatter(read.content);
  const fm = parsed.data as Record<string, unknown>;
  if (missingRequiredField(fm, filePath, skipWarnings)) return null;

  return buildArtifact(filePath, fm, parsed.content.trim(), { warnings: skipWarnings, parts });
}
