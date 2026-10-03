/**
 * Load phase: discovers and parses all catalog artifact files.
 * Returns a LoadedCatalog with raw (unvalidated, unresolved) artifacts.
 */
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { glob } from 'tinyglobby';
import yaml from 'js-yaml';
import type { Artifact, LanguageMetadata, LoadedCatalog } from './types';
import { ALL_KINDS, sourceGlob } from './kinds';
import { loadReferences } from './load-references';

/** One glob per kind, from KIND_REGISTRY's sourceDir/sourceSuffix (SKILL.md for skills). */
const ARTIFACT_PATTERNS = ALL_KINDS.map(sourceGlob);

/** Loads every language.yaml under catalogDir's languages/ subdirectories into a langId → metadata map. */
async function loadLanguages(catalogDir: string): Promise<Map<string, LanguageMetadata>> {
  const languages = new Map<string, LanguageMetadata>();
  const langYamlPaths = await glob('languages/*/language.yaml', {
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
  const languages = await loadLanguages(catalogDir);

  // tinyglobby and fast-glob both return paths in traversal order; sorting keeps every emitted file stable.
  const filePaths = (
    await glob(ARTIFACT_PATTERNS, { cwd: catalogDir, absolute: true, expandDirectories: false })
  ).sort();
  const artifacts = filePaths
    .map(filePath => parseArtifactFile(filePath, skipWarnings))
    .filter((a): a is Artifact => a !== null);

  const byId = indexById(artifacts);
  return { artifacts, byId, languages, skipWarnings };
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
  warnings: string[],
): Artifact {
  const artifact: Artifact = {
    id: fm.id as string,
    kind: fm.kind as Artifact['kind'],
    filePath,
    frontmatter: fm,
    body,
  };
  // For skills: also load sibling references/ directory
  if (fm.kind === 'skill') {
    artifact.references = loadReferences(path.dirname(filePath), warnings);
  }
  return artifact;
}

/** Parses one artifact file; returns null and records a skip reason if it should be skipped. */
function parseArtifactFile(filePath: string, skipWarnings: string[]): Artifact | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new Error(`[load] Cannot read file ${filePath}`, { cause: err });
  }

  const parsed = matter(raw);
  const fm = parsed.data as Record<string, unknown>;
  if (missingRequiredField(fm, filePath, skipWarnings)) return null;

  return buildArtifact(filePath, fm, parsed.content.trim(), skipWarnings);
}
