/**
 * Resolve phase: expands template/extends/uses references into each artifact's resolved
 * representation.
 *
 * Composition order (documented once here — every kind that supports both goes through this
 * sequence): (1) TEMPLATE — if the artifact declares `template:`, its slot content is composed
 * against the template body first, becoming the artifact's own effective body; (2) EXTENDS
 * (rules only) — the `extends` chain is then flattened on top of that: ancestor bodies are
 * prepended, oldest ancestor first. So a rule that both extends a parent AND uses a template gets
 * `parent body` + `\n\n` + `<template-composed own body>`.
 *
 * Skills: the `uses.rules` list is expanded into resolved rule objects (already flattened),
 *         and `uses.agents` IDs are recorded for the emit phase.
 *
 * All other artifact kinds (agent, prompt, workflow) go through template composition only.
 * Config kinds (hook, settings, mcp) and `template` itself never carry a `template:` field, so
 * composition is a no-op for them — they pass through with only frontmatter/body copied.
 */
import type { Artifact, LoadedCatalog, ResolvedArtifact, ResolvedCatalog } from './types';
import { composeArtifactAgainstTemplate } from './templates';

/** Composes an artifact's own body against its `template:`, if any — step (1) above. */
function ownEffectiveBody(
  artifact: Artifact,
  catalog: LoadedCatalog,
): { body: string; slots?: Record<string, string>; templateId?: string } {
  const composed = composeArtifactAgainstTemplate(artifact, catalog);
  if (!composed) return { body: artifact.body };
  return { body: composed.body, slots: composed.slots, templateId: composed.templateId };
}

/** The `templateId`/`resolvedSlots` fields to spread onto a ResolvedArtifact, or {} when untemplated. */
function templateFields(
  own: ReturnType<typeof ownEffectiveBody>,
): Pick<ResolvedArtifact, 'templateId' | 'resolvedSlots'> | Record<string, never> {
  if (!own.templateId) return {};
  return { templateId: own.templateId, resolvedSlots: own.slots ?? {} };
}

/** Template-only resolution for kinds that never carry `extends` (agent, prompt, workflow, …). */
function resolveGeneric(artifact: Artifact, catalog: LoadedCatalog): ResolvedArtifact {
  const own = ownEffectiveBody(artifact, catalog);
  if (!own.templateId) return { ...artifact };
  return {
    ...artifact,
    resolvedBody: own.body,
    resolvedSlots: own.slots ?? {},
    templateId: own.templateId,
  };
}

/** Pre-computes the resolved form of every rule (needed for skill resolution). */
function buildResolvedRuleCache(catalog: LoadedCatalog): Map<string, ResolvedArtifact> {
  const cache = new Map<string, ResolvedArtifact>();
  for (const artifact of catalog.artifacts) {
    if (artifact.kind === 'rule') {
      cache.set(artifact.id, resolveRule(artifact, catalog, cache, new Set()));
    }
  }
  return cache;
}

export function resolveCatalog(catalog: LoadedCatalog): ResolvedCatalog {
  const resolvedRuleCache = buildResolvedRuleCache(catalog);

  const resolvedArtifacts = catalog.artifacts.map(artifact => {
    switch (artifact.kind) {
      case 'rule':
        return resolvedRuleCache.get(artifact.id) ?? { ...artifact };
      case 'skill':
        return resolveSkill(artifact, catalog, resolvedRuleCache);
      case 'template':
        return { ...artifact }; // never composed against itself
      default:
        return resolveGeneric(artifact, catalog);
    }
  });

  const byId = new Map(resolvedArtifacts.map(a => [a.id, a]));
  return { artifacts: resolvedArtifacts, byId, languages: catalog.languages };
}

/**
 * Recursively resolves each `extends` ancestor's body, oldest-first.
 * The resolved list = [grandparent body, parent body, …] — the artifact's own (template-composed)
 * body is appended by the caller.
 *
 * Uses a `seen` set to guard against infinite recursion (cycles are caught in validate,
 * but we protect here too as a safety net).
 */
function resolveAncestorBodies(
  artifact: Artifact,
  catalog: LoadedCatalog,
  cache: Map<string, ResolvedArtifact>,
  seen: Set<string>,
): string[] {
  const extendsIds = (artifact.frontmatter.extends as string[] | undefined) ?? [];
  const ancestorBodies: string[] = [];
  for (const parentId of extendsIds) {
    const parent = catalog.byId.get(parentId);
    if (!parent) continue; // validate already flagged this
    const resolvedParent = resolveRule(parent, catalog, cache, seen);
    ancestorBodies.push(resolvedParent.resolvedBody ?? resolvedParent.body);
  }
  return ancestorBodies;
}

/** Builds the resolved rule object once its ancestor chain and own template composition are known. */
function buildResolvedRule(
  artifact: Artifact,
  ancestorBodies: string[],
  own: ReturnType<typeof ownEffectiveBody>,
): ResolvedArtifact {
  const resolvedBody = [...ancestorBodies, own.body].filter(Boolean).join('\n\n');
  return {
    ...artifact,
    resolvedBody,
    resolvedAncestorBodies: ancestorBodies,
    ...templateFields(own),
  };
}

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
  const ancestorBodies = resolveAncestorBodies(artifact, catalog, cache, seen);
  const own = ownEffectiveBody(artifact, catalog);

  const resolved = buildResolvedRule(artifact, ancestorBodies, own);
  cache.set(artifact.id, resolved);
  return resolved;
}

/**
 * Resolve a skill: template-compose its own body, then expand uses.rules and uses.agents.
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

  const own = ownEffectiveBody(artifact, catalog);

  return {
    ...artifact,
    ...(own.templateId ? { resolvedBody: own.body } : {}),
    ...templateFields(own),
    resolvedRules,
    resolvedAgentIds: [...agentIds],
  };
}
