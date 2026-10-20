/**
 * Renders an installed whole-file artifact the way `sigil update` would write it today. `update`,
 * `status` and the wizard's install states all call this, so no view can call a file up to date
 * that `update` would rewrite (docs/audits/2026-10-16/results.md, row 13).
 *
 * @module
 */
import type { ResolvedCatalog, Target } from './types';

/** What a fresh render needs: the catalog after project overlays, and what is installed. */
export interface FreshRenderCtx {
  target: Target;
  /** The resolved catalog with `.sigil/overlays.yaml` applied, as `add` and `update` use it. */
  resolved: ResolvedCatalog;
  projectDir: string;
  /**
   * Every artifact id installed for this target. A Boundary section lists only related artifacts
   * installed alongside, so a render without this set differs from the file `add` wrote.
   */
  installedIds?: ReadonlySet<string> | undefined;
}

/** The files `update` would write for `id`, keyed by project-relative path. */
export function renderFresh(id: string, ctx: FreshRenderCtx): Promise<Record<string, string>> {
  if (!ctx.target.scaffold) {
    return Promise.reject(new Error(`target '${ctx.target.name}' cannot scaffold files`));
  }
  return ctx.target.scaffold(id, ctx.resolved, {
    projectDir: ctx.projectDir,
    overwrite: true,
    includeDeps: false,
    ...(ctx.installedIds ? { coInstallSet: new Set(ctx.installedIds) } : {}),
  });
}
