/**
 * Shared helper for stamping `ManifestEntry.template` — used at both install time
 * (src/commands/add/execute.ts) and refresh time (src/commands/update-wholefile.ts).
 *
 * @module
 */
import type { ResolvedCatalog } from '../types';

/**
 * The composed-against template's `{id, revision}`, or undefined when `a` has no `template:`
 * (or `resolved.byId` isn't populated — tolerated defensively since callers in test fixtures
 * sometimes pass a minimal `ResolvedCatalog` stub that only needs to satisfy other fields).
 */
export function currentTemplateOf(
  a: { templateId?: string },
  resolved: ResolvedCatalog,
): { id: string; revision: number } | undefined {
  if (!a.templateId || !resolved.byId) return undefined;
  const template = resolved.byId.get(a.templateId);
  const revision = template?.frontmatter.revision;
  return typeof revision === 'number' ? { id: a.templateId, revision } : undefined;
}

/** Looks up an artifact BY ID, then delegates to {@link currentTemplateOf}. */
export function currentTemplateOfId(
  id: string,
  resolved: ResolvedCatalog,
): { id: string; revision: number } | undefined {
  const a = resolved.byId?.get(id);
  return a ? currentTemplateOf(a, resolved) : undefined;
}
