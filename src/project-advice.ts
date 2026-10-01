/**
 * What the home menu suggests for a folder. Pure: it reads only a `ProjectContext`, so every state
 * is a test fixture. `project-context.ts` re-exports these, so callers import from one place.
 *
 * @module
 */
import type { ArtifactStatus } from './manifest/types';
import type { NextAction, ProjectContext, Recommendation } from './project-context';

const HOME_REASON =
  'This is your home folder. Installing here affects every project; pick a project folder.';
const CATALOG_REASON =
  'This is a sigil catalog checkout, so installs would land inside it. Pick the project to set up.';
const ROOT_REASON =
  'This is the top of a drive, not a project. Installing here affects everything on it; pick a project folder.';
const REPAIR_REASON =
  'The record of what sigil installed here is damaged, so it cannot install, update or remove safely until it is repaired.';

/** Why installing into this folder is probably a mistake, or `undefined` when it looks fine. */
export function riskyFolderReason(ctx: ProjectContext): string | undefined {
  if (ctx.isHomeDir) return HOME_REASON;
  if (ctx.isFilesystemRoot) return ROOT_REASON;
  if (ctx.isCatalogCheckout) return CATALOG_REASON;
  return undefined;
}

function folderAdvice(ctx: ProjectContext): Recommendation[] {
  const reason = riskyFolderReason(ctx);
  return reason === undefined ? [] : [{ action: 'change-folder', reason }];
}

function setupAdvice(ctx: ProjectContext): Recommendation[] {
  if (ctx.installed > 0) return [];
  if (ctx.detectedTargets.length === 0) {
    const note = ctx.looksLikeProject ? '' : ' (this folder has no project files yet)';
    return [
      {
        action: 'init',
        reason: `No Claude Code or Copilot setup found here. Set the project up for one of them${note}.`,
      },
    ];
  }
  return [{ action: 'install', reason: 'Nothing is installed here yet.' }];
}

/**
 * One row per problem status, in the order the menu suggests fixing them. Edited files (drifted)
 * are deliberately absent: an edit is the user's own choice, the header already counts it, and no
 * action "fixes" it, so recommending one would repeat forever.
 */
const HEALTH_ADVICE: ReadonlyArray<readonly [ArtifactStatus, NextAction, string]> = [
  ['missing', 'restore', 'have deleted files'],
  ['outdated', 'update', 'have a newer catalog version'],
  ['orphaned', 'prune', 'are gone from the catalog'],
];

function healthAdvice({ health }: ProjectContext): Recommendation[] {
  return HEALTH_ADVICE.filter(([status]) => health[status] > 0).map(([status, action, what]) => ({
    action,
    reason: `${health[status]} artifact(s) ${what}.`,
  }));
}

/** Ordered suggestions for this folder; empty when it is set up and healthy. */
export function recommendNext(ctx: ProjectContext): Recommendation[] {
  // A damaged record makes "nothing installed" and every health count untrustworthy.
  const rest = ctx.manifestError
    ? [{ action: 'repair' as const, reason: REPAIR_REASON }]
    : [...setupAdvice(ctx), ...healthAdvice(ctx)];
  return [...folderAdvice(ctx), ...rest];
}
