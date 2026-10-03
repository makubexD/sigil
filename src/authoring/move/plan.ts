/**
 * Move plan computation: validate, resolve paths, scan referrers.
 * Pure function — no I/O.
 */
import path from 'path';
import type { Artifact, LoadedCatalog } from '../../types';
import { isArtifactKind, sourceRelPath } from '../../kinds';
import { namespaceDir, splitId } from '../../catalog-layout';
import { KEBAB_ID_RE } from '../../schema/shared';
import { resolveContained } from '../../cli-helpers';

// ─── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Compute the canonical file path for a new artifact id within catalogDir.
 * Mirrors the conventions used by `new` and `checkSourceArtifact`.
 *
 * Rules:
 *   - id = "shared/<name>"  → catalog/shared/<sourceRelPath(kind, name)>
 *   - id = "<lang>/<name>"  → catalog/languages/<lang>/<sourceRelPath(kind, name)>
 *   The name is the id's last segment, so a template's `shared/templates/<name>` id resolves too.
 *   Folder and file name come from KIND_REGISTRY (`sourceDir`, `sourceSuffix`).
 *
 * `newId` is validated against the same `KEBAB_ID_RE` the schema enforces on every catalog
 * artifact's `id` field before any path is computed, and the computed destination is re-checked
 * with `resolveContained()` — the same defense-in-depth pattern `cli-helpers.ts`'s `writeFilesSync`
 * uses. `move` previously only checked `!prefix || !name`, so an id like `shared/../../escape`
 * (an id `.split('/')` still destructures into a truthy prefix/name pair) reached `moveFiles`'s
 * `fs.mkdirSync`/rename unchecked — found by the round-4 (2026-08-23) audit's dogfooded
 * `ts-security-auditor` run, F22's sibling gap in a command outside the original fix's scope.
 */
export function computeDestinationPath(newId: string, kind: string, catalogDir: string): string {
  if (!KEBAB_ID_RE.test(newId)) {
    throw new Error(
      `Invalid id '${newId}' — id must be namespaced kebab-case (e.g. "shared/foo", "typescript/foo-bar")`,
    );
  }
  if (!isArtifactKind(kind)) throw new Error(`Unknown artifact kind '${kind}'`);
  const split = splitId(newId, kind);
  if (!split) {
    throw new Error(`Invalid id '${newId}' — must be '<prefix>/<name>'`);
  }
  return resolveContained(namespaceDir(catalogDir, split.prefix), sourceRelPath(kind, split.name));
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

  if (!splitId(newId, artifact.kind)) {
    const shape = artifact.kind === 'template' ? '<prefix>/templates/<name>' : '<prefix>/<name>';
    throw new Error(`New id '${newId}' must be in the form '${shape}'`);
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
