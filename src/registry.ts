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
  const targets = getAllTargets();
  const allPlatformNames = targets.map(t => t.name);

  const artifacts: RegistryEntry[] = catalog.artifacts.map(artifact => {
    const fm = artifact.frontmatter;

    const language = (fm.language as string | undefined) ?? undefined;
    const title = (fm.title as string | undefined) ?? artifact.id;
    const description = (fm.description as string | undefined) ?? '';
    const tags = (fm.tags as string[] | undefined) ?? [];
    const relatedArtifacts = fm.relatedArtifacts as RegistryEntry['relatedArtifacts'] | undefined;

    // uses: serialize ids (not the full resolved bodies) for the registry
    const uses = (() => {
      const raw = fm.uses as { rules?: string[]; agents?: string[] } | undefined;
      if (!raw) return undefined;
      const rules = raw.rules ?? [];
      const agents = raw.agents ?? [];
      return rules.length === 0 && agents.length === 0 ? undefined : { rules, agents };
    })();

    // Platforms: either declared in frontmatter or derived from all targets that support the kind
    const declaredPlatforms = fm.platforms as string[] | undefined;
    const platforms = declaredPlatforms ??
      allPlatformNames.filter(name => artifactTargetsPlatform(artifact, name));

    const sha256 = filesha256(artifact.filePath);

    const entry: RegistryEntry = {
      id: artifact.id,
      kind: artifact.kind,
      title,
      description,
      tags,
      platforms,
      version,
      sha256,
    };

    if (language !== undefined) entry.language = language;
    if (relatedArtifacts && relatedArtifacts.length > 0) entry.relatedArtifacts = relatedArtifacts;
    if (uses) entry.uses = uses;

    return entry;
  });

  // Sort for stable output: shared first, then by language, then by kind, then by id
  artifacts.sort((a, b) => {
    const aLang = a.language ?? '';
    const bLang = b.language ?? '';
    if (aLang !== bLang) return aLang.localeCompare(bLang);
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.id.localeCompare(b.id);
  });

  // Facets: sorted, deduplicated
  const kindSet = new Set<string>();
  const langSet = new Set<string>();
  const tagSet = new Set<string>();

  for (const a of artifacts) {
    kindSet.add(a.kind);
    if (a.language) langSet.add(a.language);
    for (const t of a.tags) tagSet.add(t);
  }

  const facets: RegistryFacets = {
    kinds: [...kindSet].sort(),
    languages: [...langSet].sort(),
    tags: [...tagSet].sort(),
  };

  return { version, generatedAt: timestamp, artifacts, facets };
}
