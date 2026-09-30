/**
 * Catalog registry generator — `sigil index` / wired into `sigil build`.
 *
 * Emits dist/registry.json: a flat array of per-artifact records plus a facet
 * sidecar (distinct kinds / languages / tags) for discovery and search tooling.
 *
 * Per-artifact record:
 *   { id, kind, language, title, description, tags,
 *     relatedArtifacts, uses, platforms, version, sha256 }
 *
 * sha256 is computed from the artifact's source file content (for skills: SKILL.md).
 * Stable across builds for unchanged files — used for drift detection.
 */

import fs from 'fs';
import crypto from 'crypto';
import type { ResolvedCatalog } from './types';
import { artifactTargetsPlatform } from './select';
import { getAllTargets } from './targets';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RegistryEntry {
  id: string;
  kind: string;
  language?: string;
  title: string;
  description: string;
  tags: string[];
  relatedArtifacts?: Array<{ id: string; relation: string; reason: string }>;
  uses?: { rules: string[]; agents: string[] };
  platforms: string[];
  version: string;
  sha256: string;
}

export interface RegistryFacets {
  kinds: string[];
  languages: string[];
  tags: string[];
}

export interface Registry {
  version: string;
  generatedAt: string;
  artifacts: RegistryEntry[];
  facets: RegistryFacets;
}

// ─── SHA256 helper ────────────────────────────────────────────────────────────

function filesha256(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf-8');
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

// ─── Main export ──────────────────────────────────────────────────────────────

/** Serializes an artifact's `uses:` frontmatter to bare ids for the registry (no resolved bodies). */
function buildRegistryUses(
  fm: Record<string, unknown>,
): { rules: string[]; agents: string[] } | undefined {
  const raw = fm.uses as { rules?: string[]; agents?: string[] } | undefined;
  if (!raw) return undefined;
  const rules = raw.rules ?? [];
  const agents = raw.agents ?? [];
  return rules.length === 0 && agents.length === 0 ? undefined : { rules, agents };
}

/** Derives an artifact's registry platform list: declared in frontmatter, or all supporting targets. */
function resolveRegistryPlatforms(
  artifact: ResolvedCatalog['artifacts'][number],
  allPlatformNames: string[],
): string[] {
  const declared = artifact.frontmatter.platforms as string[] | undefined;
  return declared ?? allPlatformNames.filter(name => artifactTargetsPlatform(artifact, name));
}

/** Sets the optional RegistryEntry fields (language/relatedArtifacts/uses) that may be absent. */
function applyOptionalRegistryFields(
  entry: RegistryEntry,
  fm: Record<string, unknown>,
  uses: RegistryEntry['uses'],
): void {
  const language = fm.language as string | undefined;
  const relatedArtifacts = fm.relatedArtifacts as RegistryEntry['relatedArtifacts'] | undefined;
  if (language !== undefined) entry.language = language;
  if (relatedArtifacts && relatedArtifacts.length > 0) entry.relatedArtifacts = relatedArtifacts;
  if (uses) entry.uses = uses;
}

/** Builds one artifact's RegistryEntry, deriving platforms from frontmatter or target support. */
function buildRegistryEntry(
  artifact: ResolvedCatalog['artifacts'][number],
  version: string,
  allPlatformNames: string[],
): RegistryEntry {
  const fm = artifact.frontmatter;
  const entry: RegistryEntry = {
    id: artifact.id,
    kind: artifact.kind,
    title: (fm.title as string | undefined) ?? artifact.id,
    description: (fm.description as string | undefined) ?? '',
    tags: (fm.tags as string[] | undefined) ?? [],
    platforms: resolveRegistryPlatforms(artifact, allPlatformNames),
    version,
    sha256: filesha256(artifact.filePath),
  };

  applyOptionalRegistryFields(entry, fm, buildRegistryUses(fm));

  return entry;
}

/** Sorts registry entries for stable output: shared first, then by language, kind, id. */
function compareRegistryEntries(a: RegistryEntry, b: RegistryEntry): number {
  const aLang = a.language ?? '';
  const bLang = b.language ?? '';
  if (aLang !== bLang) return aLang.localeCompare(bLang);
  if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
  return a.id.localeCompare(b.id);
}

/** Computes sorted, deduplicated kind/language/tag facets from the built artifact list. */
function buildFacets(artifacts: RegistryEntry[]): RegistryFacets {
  const kindSet = new Set<string>();
  const langSet = new Set<string>();
  const tagSet = new Set<string>();

  for (const a of artifacts) {
    kindSet.add(a.kind);
    if (a.language) langSet.add(a.language);
    for (const t of a.tags) tagSet.add(t);
  }

  return {
    kinds: [...kindSet].sort(),
    languages: [...langSet].sort(),
    tags: [...tagSet].sort(),
  };
}

/**
 * Build a registry from the resolved catalog.
 *
 * @param catalog   The fully resolved catalog.
 * @param version   Package version (written into registry metadata).
 * @param timestamp ISO-8601 timestamp string for generatedAt (injected for reproducibility).
 */
export function buildRegistry(
  catalog: ResolvedCatalog,
  version: string,
  timestamp: string,
): Registry {
  const allPlatformNames = getAllTargets().map(t => t.name);

  const artifacts = catalog.artifacts.map(artifact =>
    buildRegistryEntry(artifact, version, allPlatformNames),
  );
  artifacts.sort(compareRegistryEntries);

  const facets = buildFacets(artifacts);
  return { version, generatedAt: timestamp, artifacts, facets };
}
