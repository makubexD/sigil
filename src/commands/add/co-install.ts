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
import type { LanguageMetadata } from '../../types';
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
  warnCommandOverlaps(ctx.opts.projectDir, skills, ctx.resolved.languages);
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
 * then shows both, and the user has to pick. Language skills carry the language's prefix
 * (`py-generate-tests`) while the project's own copy usually does not (`generate-tests`), so
 * compare the unprefixed name against `.claude/commands/<rest>.md` and `.claude/skills/<rest>/`.
 * A shared skill has no prefix and only a command can collide with it: `.claude/skills/<name>/`
 * is the skill's own install path. Warn only — an existing file is the user's, never something
 * to block or overwrite here.
 *
 * @param languages - The resolved catalog's language metadata, keyed by namespace.
 */
export function warnCommandOverlaps(
  projectDir: string,
  skillIds: Iterable<string>,
  languages: ReadonlyMap<string, LanguageMetadata>,
): void {
  const seen = new Set<string>();
  for (const id of skillIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const slash = id.indexOf('/');
    if (slash <= 0) continue;
    const namespace = id.slice(0, slash);
    const name = id.slice(slash + 1);
    const rest =
      namespace === 'shared' ? name : stripLanguagePrefix(name, languages.get(namespace));
    // Unprefixed, `.claude/skills/<name>/` is the skill's own install path, so only a command collides.
    const overlap = overlapPathFor(projectDir, rest, rest !== name);
    if (overlap !== undefined) console.warn(`  ⚠  ${id} overlaps ${overlap}; keep one.`);
  }
}

/** `py-generate-tests` → `generate-tests`, but only when the name carries the language's prefix. */
function stripLanguagePrefix(name: string, language: LanguageMetadata | undefined): string {
  const prefix = language?.prefix;
  return prefix !== undefined && name.startsWith(`${prefix}-`)
    ? name.slice(prefix.length + 1)
    : name;
}

/** The project file this name would duplicate, if one exists. */
function overlapPathFor(
  projectDir: string,
  name: string,
  checkSkillDir: boolean,
): string | undefined {
  const commandPath = path.join(projectDir, '.claude', 'commands', `${name}.md`);
  const skillPath = path.join(projectDir, '.claude', 'skills', name);
  try {
    if (fs.existsSync(commandPath)) return `.claude/commands/${name}.md`;
    if (checkSkillDir && fs.existsSync(skillPath) && fs.statSync(skillPath).isDirectory()) {
      return `.claude/skills/${name}/`;
    }
  } catch {
    // An unreadable path is no reason to fail the install; skip the note.
    return undefined;
  }
  return undefined;
}
