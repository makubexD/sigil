/**
 * Load phase: discovers and parses all catalog artifact files.
 * Returns a LoadedCatalog with raw (unvalidated, unresolved) artifacts.
 */
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import glob from 'fast-glob';
import yaml from 'js-yaml';
import type { Artifact, LanguageMetadata, LoadedCatalog, ReferenceFile } from './types';

/**
 * File-extension patterns that identify each artifact kind.
 * SKILL.md is a special case: it is always a directory-based skill.
 */
const ARTIFACT_PATTERNS = [
  '**/SKILL.md',
  '**/*.rule.md',
  '**/*.agent.md',
  '**/*.prompt.md',
  '**/*.workflow.md',
];

/**
 * Loads the entire catalog from catalogDir and returns a flat artifact list
 * plus language metadata from each language.yaml.
 *
 * @param catalogDir - Absolute path to the catalog/ directory.
 */
export async function loadCatalog(catalogDir: string): Promise<LoadedCatalog> {
  const artifacts: Artifact[] = [];
  const languages = new Map<string, LanguageMetadata>();

  // ── 1. Language metadata ──────────────────────────────────────────────────
  const langYamlPaths = await glob('languages/*/language.yaml', {
    cwd: catalogDir,
    absolute: true,
  });

  for (const yamlPath of langYamlPaths) {
    try {
      const raw = fs.readFileSync(yamlPath, 'utf-8');
      const meta = yaml.load(raw) as Omit<LanguageMetadata, 'id'>;
      const langId = path.basename(path.dirname(yamlPath));
      languages.set(langId, { id: langId, ...meta });
    } catch (err) {
      throw new Error(`[load] Failed to parse language.yaml at ${yamlPath}: ${err}`);
    }
  }

  // ── 2. Artifact files ─────────────────────────────────────────────────────
  const filePaths = await glob(ARTIFACT_PATTERNS, {
    cwd: catalogDir,
    absolute: true,
  });

  for (const filePath of filePaths) {
    const artifact = parseArtifactFile(filePath);
    if (artifact) {
      artifacts.push(artifact);
    }
  }

  // Validate uniqueness of IDs
  const byId = new Map<string, Artifact>();
  for (const artifact of artifacts) {
    if (byId.has(artifact.id)) {
      const existing = byId.get(artifact.id)!;
      throw new Error(
        `[load] Duplicate artifact id '${artifact.id}'\n` +
        `  First:  ${existing.filePath}\n` +
        `  Second: ${artifact.filePath}`,
      );
    }
    byId.set(artifact.id, artifact);
  }

  return { artifacts, byId, languages };
}

/** Parses one artifact file; returns null and warns if the file should be skipped. */
function parseArtifactFile(filePath: string): Artifact | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new Error(`[load] Cannot read file ${filePath}: ${err}`);
  }

  const parsed = matter(raw);
  const fm = parsed.data as Record<string, unknown>;

  if (!fm.id) {
    console.warn(`[load] Skipping ${filePath}: missing 'id' in frontmatter`);
    return null;
  }
  if (!fm.kind) {
    console.warn(`[load] Skipping ${filePath}: missing 'kind' in frontmatter`);
    return null;
  }

  const artifact: Artifact = {
    id: fm.id as string,
    kind: fm.kind as Artifact['kind'],
    filePath,
    frontmatter: fm,
    body: parsed.content.trim(),
  };

  // For skills: also load sibling references/ directory
  if (fm.kind === 'skill') {
    artifact.references = loadReferences(path.dirname(filePath));
  }

  return artifact;
}

/** Reads all *.md files inside <skillDir>/references/ and returns them as ReferenceFile[]. */
function loadReferences(skillDir: string): ReferenceFile[] {
  const refsDir = path.join(skillDir, 'references');
  if (!fs.existsSync(refsDir)) return [];

  const files = fs.readdirSync(refsDir).filter(f => f.endsWith('.md'));
  return files.map(filename => ({
    name: filename,
    content: fs.readFileSync(path.join(refsDir, filename), 'utf-8'),
  }));
}
