/**
 * Resolve phase: expands extends/uses references into each artifact's resolved representation.
 *
 * Rules: the `extends` chain is flattened — ancestor bodies are prepended so the resolved
 *        body contains the full inherited guidance, oldest ancestor first.
 *
 * Skills: the `uses.rules` list is expanded into resolved rule objects (already flattened),
 *         and `uses.agents` IDs are recorded for the emit phase.
 *
 * All other artifact kinds pass through unchanged.
 */
import type {
  Artifact,
  LoadedCatalog,
  ResolvedArtifact,
  ResolvedCatalog,
} from './types';

export function resolveCatalog(catalog: LoadedCatalog): ResolvedCatalog {
  // Pre-compute the resolved form of every rule (needed for skill resolution)
  const resolvedRuleCache = new Map<string, ResolvedArtifact>();

  // Resolve rules first so the cache is ready for skills
  for (const artifact of catalog.artifacts) {
    if (artifact.kind === 'rule') {
      resolvedRuleCache.set(
        artifact.id,
        resolveRule(artifact, catalog, resolvedRuleCache, new Set()),
      );
    }
  }

  // Now resolve all artifacts
  const resolvedArtifacts = catalog.artifacts.map(artifact => {
    switch (artifact.kind) {
      case 'rule':
        return resolvedRuleCache.get(artifact.id) ?? { ...artifact };
      case 'skill':
        return resolveSkill(artifact, catalog, resolvedRuleCache);
      default:
        return { ...artifact };
    }
  });

  const byId = new Map(resolvedArtifacts.map(a => [a.id, a]));
  return { artifacts: resolvedArtifacts, byId, languages: catalog.languages };
}

/**
 * Recursively flatten the `extends` chain for a rule.
 * The resolved body = [grandparent body, parent body, …, own body] joined by blank line.
 *
 * Uses a `seen` set to guard against infinite recursion (cycles are caught in validate,
 * but we protect here too as a safety net).
 */
function resolveRule(
  artifact: Artifact,
  catalog: LoadedCatalog,
  cache: Map<string, ResolvedArtifact>,
  seen: Set<string>,
): ResolvedArtifact {
  if (seen.has(artifact.id)) {
    // Cycle guard — return the artifact body as-is
    return { ...artifact };
  }

  const cached = cache.get(artifact.id);
  if (cached) return cached;

  seen = new Set(seen).add(artifact.id);

  const extendsIds = (artifact.frontmatter.extends as string[] | undefined) ?? [];
  const ancestorBodies: string[] = [];

  for (const parentId of extendsIds) {
    const parent = catalog.byId.get(parentId);
    if (!parent) continue; // validate already flagged this
    const resolvedParent = resolveRule(parent, catalog, cache, seen);
    ancestorBodies.push(resolvedParent.resolvedBody ?? resolvedParent.body);
  }

  const resolvedBody = [...ancestorBodies, artifact.body]
    .filter(Boolean)
    .join('\n\n');

  const resolved: ResolvedArtifact = { ...artifact, resolvedBody };
  cache.set(artifact.id, resolved);
  return resolved;
}

/**
 * Resolve a skill: expand uses.rules and uses.agents.
 */
function resolveSkill(
  artifact: Artifact,
  catalog: LoadedCatalog,
  ruleCache: Map<string, ResolvedArtifact>,
): ResolvedArtifact {
  const uses = artifact.frontmatter.uses as { rules?: string[]; agents?: string[] } | undefined;
  const ruleIds = uses?.rules ?? [];
  const agentIds = uses?.agents ?? [];

  const resolvedRules: ResolvedArtifact[] = ruleIds
    .map(id => ruleCache.get(id))
    .filter((r): r is ResolvedArtifact => r !== undefined);

  return {
    ...artifact,
    resolvedRules,
    resolvedAgentIds: [...agentIds],
  };
}
