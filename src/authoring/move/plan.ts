/**
 * Move plan computation: validate, resolve paths, scan referrers.
 * Pure function — no I/O.
 */
import path from 'path';
import type { Artifact, LoadedCatalog } from '../../types';
import { SKILL_FILENAME, ID_PART_COUNT } from '../../paths';

// ─── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Compute the canonical file path for a new artifact id within catalogDir.
 * Mirrors the conventions used by `new` and `checkSourceArtifact`.
 *
 * Rules:
 *   - id = "shared/<name>"  → catalog/shared/{kind}s/<name>.{kind}.md
 *                             (skill: catalog/shared/skills/<name>/SKILL.md)
 *   - id = "<lang>/<name>"  → catalog/languages/<lang>/{kind}s/<name>.{kind}.md
 *                             (skill: catalog/languages/<lang>/skills/<name>/SKILL.md)
 */
export function computeDestinationPath(newId: string, kind: string, catalogDir: string): string {
  const [prefix, name] = newId.split('/');
  if (!prefix || !name) {
    throw new Error(`Invalid id '${newId}' — must be '<prefix>/<name>'`);
  }

  const base =
    prefix === 'shared'
      ? path.join(catalogDir, 'shared')
      : path.join(catalogDir, 'languages', prefix);

  if (kind === 'skill') {
    return path.join(base, 'skills', name, SKILL_FILENAME);
  }
  return path.join(base, `${kind}s`, `${name}.${kind}.md`);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Referrer {
  /** Absolute path of the referring artifact's file. */
  filePath: string;
  /** ID of the referring artifact. */
  artifactId: string;
  /** Which field(s) reference the old id. */
  fields: Array<'extends' | 'uses.rules' | 'uses.agents'>;
}

export interface MovePlan {
  artifact: Artifact;
  oldId: string;
  newId: string;
  /** Source path to move FROM (skill: directory; others: single file). */
  sourcePath: string;
  /** Destination path to move TO (directory or file). */
  destinationPath: string;
  /** All artifacts that must have their reference rewritten. */
  referrers: Referrer[];
}

// ─── Plan function ────────────────────────────────────────────────────────────

/** Validates the move request; returns the source artifact or throws a descriptive error. */
function resolveMoveSource(oldId: string, newId: string, catalog: LoadedCatalog): Artifact {
  const artifact = catalog.byId.get(oldId);
  if (!artifact) {
    throw new Error(`Artifact '${oldId}' not found. Run \`sigil list\` to see available ids.`);
  }

  const parts = newId.split('/');
  if (parts.length !== ID_PART_COUNT || !parts[0] || !parts[1]) {
    throw new Error(`New id '${newId}' must be in the form '<prefix>/<name>'`);
  }

  if (catalog.byId.has(newId)) {
    throw new Error(`Artifact '${newId}' already exists — choose a different id.`);
  }

  return artifact;
}

/** Computes the source and destination paths for a move, directory-aware for skills. */
function resolveMovePaths(
  artifact: Artifact,
  newId: string,
  catalogDir: string,
): { sourcePath: string; destinationPath: string } {
  const isSkill = artifact.kind === 'skill';
  const sourcePath = isSkill ? path.dirname(artifact.filePath) : artifact.filePath;
  const destinationPath = isSkill
    ? path.dirname(computeDestinationPath(newId, 'skill', catalogDir))
    : computeDestinationPath(newId, artifact.kind, catalogDir);
  return { sourcePath, destinationPath };
}

/** Returns the `extends`/`uses.rules`/`uses.agents` fields on `a` that reference `oldId`. */
function referrerFields(a: Artifact, oldId: string): Referrer['fields'] {
  const fields: Referrer['fields'] = [];
  const extendsRefs = (a.frontmatter.extends as string[] | undefined) ?? [];
  if (extendsRefs.includes(oldId)) fields.push('extends');

  const uses = a.frontmatter.uses as { rules?: string[]; agents?: string[] } | undefined;
  if ((uses?.rules ?? []).includes(oldId)) fields.push('uses.rules');
  if ((uses?.agents ?? []).includes(oldId)) fields.push('uses.agents');
  return fields;
}

/** Scans the catalog for artifacts that reference `oldId` via extends/uses. */
function scanReferrers(catalog: LoadedCatalog, oldId: string): Referrer[] {
  const referrers: Referrer[] = [];
  for (const a of catalog.artifacts) {
    if (a.id === oldId) continue;
    const fields = referrerFields(a, oldId);
    if (fields.length > 0) {
      referrers.push({ filePath: a.filePath, artifactId: a.id, fields });
    }
  }
  return referrers;
}

/**
 * Compute a move plan without executing any I/O.
 *
 * @param oldId      Current artifact id.
 * @param newId      New artifact id.
 * @param catalog    Loaded catalog (for referrer scan + collision check).
 * @param catalogDir Catalog root directory (for path computation).
 */
export function planMove(
  oldId: string,
  newId: string,
  catalog: LoadedCatalog,
  catalogDir: string,
): MovePlan {
  const artifact = resolveMoveSource(oldId, newId, catalog);
  const { sourcePath, destinationPath } = resolveMovePaths(artifact, newId, catalogDir);
  const referrers = scanReferrers(catalog, oldId);

  return { artifact, oldId, newId, sourcePath, destinationPath, referrers };
}
