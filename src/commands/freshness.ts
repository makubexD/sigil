/**
 * Which installed artifacts `sigil update` would rewrite from today's catalog. `status` reports
 * these as outdated; the checks are the ones `update` applies, so the two commands cannot
 * disagree (docs/audits/2026-10-16/results.md, row 13).
 *
 * @module
 */
import { sha256 } from '../manifest';
import { renderFresh, type FreshRenderCtx } from '../fresh-render';
import { catalogConfigOps, changedCatalogOp } from './update-config-catalog';
import { isConfigEntry } from './update-config';
import type { Manifest, ManifestEntry } from '../manifest/types';
import type { ResolvedCatalog, Target } from '../types';

/** True when writing `fresh` would change or add a file, or retire one `update` would delete. */
function wholeFileChanged(entry: ManifestEntry, fresh: Record<string, string>): boolean {
  const recorded = new Map(entry.files.map(f => [f.path, f.sha256]));
  const changed = Object.entries(fresh).some(([p, text]) => recorded.get(p) !== sha256(text));
  return changed || entry.files.some(f => !(f.path in fresh));
}

/** Whether `update` would rewrite `entry`. A render that fails counts as not outdated. */
async function isStale(entry: ManifestEntry, ctx: FreshRenderCtx): Promise<boolean> {
  try {
    if (isConfigEntry(entry)) {
      const ops = await catalogConfigOps(entry.id, ctx, ctx.projectDir);
      return (entry.configFiles ?? []).some(cf => changedCatalogOp(cf, ops) !== undefined);
    }
    return wholeFileChanged(entry, await renderFresh(entry.id, ctx));
  } catch {
    return false;
  }
}

/**
 * The `manifest` entries `update` would rewrite, on targets that can scaffold. Entries, not ids:
 * one id can be installed for several targets.
 */
export async function staleEntries(
  manifest: Manifest,
  resolved: ResolvedCatalog,
  projectDir: string,
  targetOf: (name: string) => Target | undefined,
): Promise<Set<ManifestEntry>> {
  const stale = new Set<ManifestEntry>();
  const targetNames = new Set(manifest.entries.map(e => e.target));
  for (const name of targetNames) {
    const target = targetOf(name);
    if (!target?.scaffold) continue;
    const entries = manifest.entries.filter(e => e.target === name);
    const installedIds = new Set(entries.map(e => e.id));
    const ctx: FreshRenderCtx = { target, resolved, projectDir, installedIds };
    for (const entry of entries.filter(e => resolved.byId.has(e.id))) {
      if (await isStale(entry, ctx)) stale.add(entry);
    }
  }
  return stale;
}
