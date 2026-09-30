/**
 * Dependency closure computation for the `add` command wizard.
 *
 * For each skill in a selection, walks `resolvedRules` and `resolvedAgentIds`
 * (populated by `resolve.ts` from `uses:` frontmatter) to find rules/agents that
 * are NOT already in the primary selection. These are the wizard's "recommended deps".
 *
 * Pure function — no I/O, no target coupling.
 */
import type { ResolvedCatalog, ResolvedArtifact } from '../types';
import { hasUsesClosure } from '../kinds';

/**
 * One artifact in the dependency closure, annotated with which skills pulled it in.
 * `via` is the list of skill IDs whose `uses:` frontmatter references this artifact.
 */
export interface ClosureEntry {
  artifact: ResolvedArtifact;
  via: string[];
}

/**
 * The resolved install preview for a selection: the user's direct picks (primary)
 * and any rules/agents they reference via `uses:` that are NOT already in primary
 * (dependencies). Both lists are in stable, de-duped order (rules before agents in
 * the dependency list).
 */
export interface ClosurePreview {
  primary: ResolvedArtifact[];
  dependencies: ClosureEntry[];
}

/**
 * Compute the dependency closure for a given set of primary artifact IDs.
 *
 * For each skill in `primaryIds`, walks `resolvedRules` and `resolvedAgentIds`
 * to find rules/agents referenced via `uses:` that are NOT already in `primaryIds`.
 *
 * Returns:
 *   - `primary`: the resolved artifacts for each primary ID (in selection order)
 *   - `dependencies`: rules first, then agents, each tagged with the `via` skill IDs
 */
export function computeClosure(primaryIds: string[], catalog: ResolvedCatalog): ClosurePreview {
  const primarySet = new Set(primaryIds);

  const primary: ResolvedArtifact[] = primaryIds
    .map(id => catalog.byId.get(id))
    .filter((a): a is ResolvedArtifact => a !== undefined);

  // depId → Set of skill IDs that pull it in
  const depVia = new Map<string, Set<string>>();

  for (const artifact of primary) {
    if (!hasUsesClosure(artifact.kind)) continue;

    for (const rule of artifact.resolvedRules ?? []) {
      if (!primarySet.has(rule.id)) {
        if (!depVia.has(rule.id)) depVia.set(rule.id, new Set());
        depVia.get(rule.id)!.add(artifact.id);
      }
    }

    for (const agentId of artifact.resolvedAgentIds ?? []) {
      if (!primarySet.has(agentId)) {
        if (!depVia.has(agentId)) depVia.set(agentId, new Set());
        depVia.get(agentId)!.add(artifact.id);
      }
    }
  }

  // Stable order: rules before agents, in the order they were first encountered
  const ruleEntries: ClosureEntry[] = [];
  const agentEntries: ClosureEntry[] = [];

  for (const [depId, viaSet] of depVia) {
    const depArtifact = catalog.byId.get(depId);
    if (!depArtifact) continue;
    const entry: ClosureEntry = { artifact: depArtifact, via: [...viaSet] };
    if (depArtifact.kind === 'rule') ruleEntries.push(entry);
    else agentEntries.push(entry);
  }

  return { primary, dependencies: [...ruleEntries, ...agentEntries] };
}
