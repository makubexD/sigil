/**
 * Output paths of candidates the manifest does not track, for `computeInstallStates`: a
 * whole-file candidate whose paths already exist on disk is `foreign`. Tracked candidates get
 * their state from `computeStatus` and `staleEntries` (src/freshness.ts) instead.
 *
 * @module
 */
import { renderFresh } from './freshness';
import { CONFIG_KINDS } from './select';
import type { Manifest } from './manifest';
import type { ResolvedCatalog, Target } from './types';

/** What {@link prescaffoldUntracked} needs from the install-state context. */
export interface PrescaffoldCtx {
  candidateIds: string[];
  target: Target;
  catalog: ResolvedCatalog;
  projectDir: string;
  manifest: Manifest;
}

/**
 * Renders each untracked whole-file candidate and returns its output paths by id. A candidate
 * the target cannot render is left out, so it reads as `new`.
 */
export async function prescaffoldUntracked(ctx: PrescaffoldCtx): Promise<Map<string, string[]>> {
  const tracked = new Set(
    ctx.manifest.entries.filter(e => e.target === ctx.target.name).map(e => e.id),
  );
  const paths = new Map<string, string[]>();
  for (const id of ctx.candidateIds) {
    if (tracked.has(id) || CONFIG_KINDS.has(ctx.catalog.byId.get(id)?.kind ?? '')) continue;
    try {
      const fresh = await renderFresh(id, {
        target: ctx.target,
        resolved: ctx.catalog,
        projectDir: ctx.projectDir,
      });
      paths.set(id, Object.keys(fresh));
    } catch {
      // Not renderable here: no paths to find on disk.
    }
  }
  return paths;
}
