/**
 * The set of artifacts installed once this `sigil add` finishes — what a Boundary section's
 * "related artifacts" are checked against. It must match what `sigil update` passes (every
 * manifest id for the target), or update re-renders a file `add` just wrote. Found by the
 * 2026-09-27 install audit: the two shared auditors, pulled in as `uses:` dependencies, lost
 * each other's Boundary entry because only the direct picks were counted.
 *
 * @module
 */
import { loadManifest } from '../../manifest';
import { preloadedSkillIds } from '../../refs';
import { computeClosure } from '../../select/closure';
import type { PlanCtx } from './plan-context';

export function coInstallSetFor(ctx: PlanCtx, pickedIds: readonly string[]): Set<string> {
  const deps = ctx.inputs.includeDeps
    ? computeClosure([...pickedIds], ctx.resolved).dependencies.map(d => d.artifact.id)
    : [];
  const installed = loadManifest(ctx.opts.projectDir)
    .entries.filter(e => e.target === ctx.targetName)
    .map(e => e.id);
  const coInstalled = new Set([...pickedIds, ...deps, ...installed]);
  warnMissingPreloads(ctx, coInstalled);
  return coInstalled;
}

/**
 * An agent that preloads a skill (`claude: { skills }`) names it in its `skills:` list; if the
 * skill isn't installed, Claude Code has nothing to load. Dependencies come only from `uses:`,
 * so say which skill to add.
 */
function warnMissingPreloads(ctx: PlanCtx, coInstalled: ReadonlySet<string>): void {
  for (const id of coInstalled) {
    const artifact = ctx.resolved.byId.get(id);
    if (artifact?.kind !== 'agent') continue;
    for (const skillId of preloadedSkillIds(artifact.frontmatter)) {
      if (coInstalled.has(skillId)) continue;
      console.warn(`  ⚠  ${id} preloads skill ${skillId}, which isn't installed.`);
      console.warn(`     Add it with: sigil add skill:${skillId}`);
    }
  }
}
