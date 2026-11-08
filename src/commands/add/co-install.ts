/**
 * The set of artifacts installed once this `sigil add` finishes — what a Boundary section's
 * "related artifacts" are checked against. It must match what `sigil update` passes (every
 * manifest id for the target), or update re-renders a file `add` just wrote. Found by the
 * 2026-09-27 install audit: the two shared auditors, pulled in as `uses:` dependencies, lost
 * each other's Boundary entry because only the direct picks were counted. A dependency an enabled
 * plugin delivers under `--complement` is not written, so it is not counted either.
 *
 * @module
 */
import fs from 'fs';
import path from 'path';
import { loadManifest } from '../../manifest';
import { preloadedSkillIds } from '../../refs';
import { computeClosure } from '../../select/closure';
import type { PlanCtx } from './plan-context';

export function coInstallSetFor(
  ctx: PlanCtx,
  pickedIds: readonly string[],
  excludeDeps: ReadonlySet<string>,
): Set<string> {
  const deps = ctx.inputs.includeDeps
    ? computeClosure([...pickedIds], ctx.resolved, ctx.target)
        .dependencies.map(d => d.artifact.id)
        .filter(id => !excludeDeps.has(id))
    : [];
  const installed = loadManifest(ctx.opts.projectDir)
    .entries.filter(e => e.target === ctx.targetName)
    .map(e => e.id);
  const coInstalled = new Set([...pickedIds, ...deps, ...installed]);
  warnMissingPreloads(ctx, coInstalled);
  warnInstallingSkillOverlaps(ctx, pickedIds, deps);
  return coInstalled;
}

/** The skill overlap check applies only to Claude Code, which owns the `.claude/` layout. */
function warnInstallingSkillOverlaps(
  ctx: PlanCtx,
  pickedIds: readonly string[],
  deps: readonly string[],
): void {
  if (ctx.targetName !== 'claude') return;
  const skills = [...pickedIds, ...deps].filter(id => ctx.resolved.byId.get(id)?.kind === 'skill');
  warnCommandOverlaps(ctx.opts.projectDir, skills);
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

/**
 * A catalog skill and a hand-written command (or skill) can answer the same request; Claude Code
 * then shows both, and the user has to pick. Language skills carry a prefix (`py-generate-tests`)
 * while the project's own copy usually does not (`generate-tests`), so compare the unprefixed
 * name against `.claude/commands/<rest>.md` and `.claude/skills/<rest>/`. Warn only — an existing
 * file is the user's, never something to block or overwrite here.
 */
export function warnCommandOverlaps(projectDir: string, skillIds: Iterable<string>): void {
  const seen = new Set<string>();
  for (const id of skillIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const slash = id.indexOf('/');
    if (slash <= 0 || id.slice(0, slash) === 'shared') continue;
    const rest = id.slice(slash + 1).replace(/^[a-z]+-/, '');
    const overlap = overlapPathFor(projectDir, rest);
    if (overlap !== undefined) console.warn(`  ⚠  ${id} overlaps ${overlap}; keep one.`);
  }
}

/** The project file this unprefixed skill name would duplicate, if one exists. */
function overlapPathFor(projectDir: string, rest: string): string | undefined {
  const commandPath = path.join(projectDir, '.claude', 'commands', `${rest}.md`);
  const skillPath = path.join(projectDir, '.claude', 'skills', rest);
  try {
    if (fs.existsSync(commandPath)) return `.claude/commands/${rest}.md`;
    if (fs.existsSync(skillPath) && fs.statSync(skillPath).isDirectory()) {
      return `.claude/skills/${rest}/`;
    }
  } catch {
    // An unreadable path is no reason to fail the install; skip the note.
    return undefined;
  }
  return undefined;
}
