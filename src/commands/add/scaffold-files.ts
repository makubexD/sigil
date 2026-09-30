/**
 * Whole-file scaffold collection for `sigil add` — walks primary picks + their dependency
 * closure, scaffolds each, and records the written paths (+ template info) per artifact id.
 * Split out of execute.ts to keep that file under the repo's own module-size threshold.
 *
 * @module
 */
import { hasUsesClosure } from '../../kinds';
import { currentTemplateOf as templateOf } from '../../manifest/template-of';
import type { ResolvedCatalog, Target } from '../../types';
import type { AddPlan } from './plan';

export interface FilesByArtifact {
  relPaths: string[];
  kind: string;
  /** The template this artifact composed against, and its current revision — undefined if none. */
  template?: { id: string; revision: number } | undefined;
}

/** Shared context for the whole-file scaffold helpers below. */
interface ScaffoldCtx {
  resolved: ResolvedCatalog;
  target: Target;
  plan: AddPlan;
  writtenPaths: Set<string>;
}

/** Scaffolds one artifact (deps excluded) and records the subset of paths actually written. */
async function scaffoldWrittenFiles(
  id: string,
  kind: string,
  ctx: ScaffoldCtx,
  template: FilesByArtifact['template'],
): Promise<FilesByArtifact | undefined> {
  const scaffolded = await ctx.target.scaffold!(id, ctx.resolved, {
    ...ctx.plan.scaffoldOpts,
    includeDeps: false,
  });
  const relPaths = Object.keys(scaffolded).filter(p => ctx.writtenPaths.has(p));
  return relPaths.length > 0 ? { relPaths, kind, template } : undefined;
}

/** Scaffolds each primary pick (deps excluded) and records the subset of paths actually written. */
async function scaffoldPrimaryFiles(
  wholeFileIds: string[],
  ctx: ScaffoldCtx,
): Promise<Map<string, FilesByArtifact>> {
  const filesByArtifact = new Map<string, FilesByArtifact>();
  for (const id of wholeFileIds) {
    const a = ctx.resolved.byId.get(id);
    if (!a) continue;
    const entry = await scaffoldWrittenFiles(id, a.kind, ctx, templateOf(a, ctx.resolved));
    if (entry) filesByArtifact.set(id, entry);
  }
  return filesByArtifact;
}

/** Records that `id` depends on `parentId` (via `uses.rules`/`uses.agents`) in `depMap`. */
function recordDependency(depMap: Map<string, string[]>, depId: string, parentId: string): void {
  const existing = depMap.get(depId) ?? [];
  existing.push(parentId);
  depMap.set(depId, existing);
}

/** Records one primary artifact's rule/agent deps (that aren't themselves primary picks). */
function recordArtifactDependencies(
  depMap: Map<string, string[]>,
  id: string,
  a: { kind: string; resolvedRules?: { id: string }[]; resolvedAgentIds?: string[] },
  wholeFileIds: string[],
): void {
  if (!hasUsesClosure(a.kind)) return;
  for (const rule of a.resolvedRules ?? []) {
    if (!wholeFileIds.includes(rule.id)) recordDependency(depMap, rule.id, id);
  }
  for (const agentId of a.resolvedAgentIds ?? []) {
    if (!wholeFileIds.includes(agentId)) recordDependency(depMap, agentId, id);
  }
}

/** Maps each dependency id (rule/agent pulled in via `uses`) to its parent primary IDs. */
function buildDependencyMap(
  wholeFileIds: string[],
  resolved: ResolvedCatalog,
): Map<string, string[]> {
  const depMap = new Map<string, string[]>();
  for (const id of wholeFileIds) {
    const a = resolved.byId.get(id);
    if (!a) continue;
    recordArtifactDependencies(depMap, id, a, wholeFileIds);
  }
  return depMap;
}

/** Scaffolds each dependency artifact and records the subset of paths actually written. */
async function scaffoldDependencyFiles(
  depMap: Map<string, string[]>,
  ctx: ScaffoldCtx,
  filesByArtifact: Map<string, FilesByArtifact>,
): Promise<void> {
  for (const depId of depMap.keys()) {
    const depArtifact = ctx.resolved.byId.get(depId);
    if (!depArtifact) continue;
    const entry = await scaffoldWrittenFiles(
      depId,
      depArtifact.kind,
      ctx,
      templateOf(depArtifact, ctx.resolved),
    );
    if (entry) filesByArtifact.set(depId, entry);
  }
}

/** Scaffolds primary + (optionally) dependency files, returning the combined manifest map. */
export async function scaffoldManifestFiles(
  plan: AddPlan,
  writtenPaths: Set<string>,
): Promise<{ filesByArtifact: Map<string, FilesByArtifact>; depMap: Map<string, string[]> }> {
  const { resolved, target, wholeFileIds } = plan;
  const ctx: ScaffoldCtx = { resolved, target, plan, writtenPaths };

  const filesByArtifact = await scaffoldPrimaryFiles(wholeFileIds, ctx);

  const depMap = plan.effectiveIncludeDeps
    ? buildDependencyMap(wholeFileIds, resolved)
    : new Map<string, string[]>();
  if (plan.effectiveIncludeDeps) {
    await scaffoldDependencyFiles(depMap, ctx, filesByArtifact);
  }

  return { filesByArtifact, depMap };
}
