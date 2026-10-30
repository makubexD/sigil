/**
 * Applying the consumer overlays (`src/overlays.ts`) for a command, and reporting what they could
 * not apply: a run reports each issue once, also when it overlays one catalog per catalog the
 * manifest records, and the artifacts whose overlay was refused are left as installed or skipped.
 *
 * @module
 */
import { OVERLAYS_FILE, loadOverlays, withOverlays } from './overlays';
import type { OverlaidCatalog } from './overlays';
import type { SelectionResult } from './select';
import type { ResolvedCatalog } from './types';

const printWarning = (message: string) => console.warn(`  ⚠  ${message}`);

/**
 * The project's overlays applied to `resolved`, each entry it could not apply reported once
 * through `warn`: an ignored one changes nothing, a refused rule is not installed or updated.
 */
export function applyProjectOverlays(
  resolved: ResolvedCatalog,
  projectDir: string,
  warn: (message: string) => void = printWarning,
): OverlaidCatalog {
  const overlaid = overlayProject(resolved, projectDir);
  reportOverlayIssues([overlaid], warn);
  return overlaid;
}

/** The project's overlays applied to `resolved`, reporting nothing (see `reportOverlayIssues`). */
export function overlayProject(resolved: ResolvedCatalog, projectDir: string): OverlaidCatalog {
  return withOverlays(resolved, loadOverlays(projectDir));
}

/**
 * Reports, once, each entry the overlays of a run could not apply, when one run overlays several
 * catalogs (one per catalog the manifest records). An entry is ignored only when every catalog
 * ignored it, since a rule one catalog lacks may be in another; a refused one is reported once.
 */
export function reportOverlayIssues(
  overlaid: readonly OverlaidCatalog[],
  warn: (message: string) => void = printWarning,
): void {
  const [first, ...rest] = overlaid;
  if (first === undefined) return;
  for (const [id, reason] of first.ignored) {
    if (rest.every(o => o.ignored.has(id))) warn(`${OVERLAYS_FILE}: ${id}: ${reason}; ignored`);
  }
  const refused = new Map(overlaid.flatMap(o => [...o.refused]));
  for (const [id, reason] of refused) {
    warn(
      `${OVERLAYS_FILE}: ${id}: ${reason}; this rule is not installed or updated until it is fixed`,
    );
  }
}

/**
 * `entries` without those whose overlay was refused, each reported through `warn`: an installed
 * artifact is left as it is rather than re-rendered wider than the project asked.
 */
export function withoutRefused<T extends { id: string }>(
  entries: T[],
  refused: ReadonlyMap<string, string>,
  warn: (message: string) => void = printWarning,
): T[] {
  return entries.filter(entry => {
    const reason = refused.get(entry.id);
    if (reason !== undefined) warn(`${entry.id} left as installed: ${refusedReason(reason)}`);
    return reason === undefined;
  });
}

/**
 * `selection` with every id whose overlay was refused moved to `skipped` (cause `overlay`). `sigil
 * add` and the add wizard's preview both call it, so the plan shown is the plan installed.
 */
export function skipRefused(
  selection: SelectionResult,
  refused: ReadonlyMap<string, string> | undefined,
  catalog: ResolvedCatalog,
): SelectionResult {
  if (!refused?.size) return selection;
  const skipped = selection.ids
    .filter(id => refused.has(id))
    .map(id => ({
      id,
      kind: catalog.byId.get(id)?.kind ?? 'rule',
      reason: refusedReason(refused.get(id) ?? ''),
      cause: 'overlay' as const,
    }));
  return {
    ids: selection.ids.filter(id => !refused.has(id)),
    skipped: [...selection.skipped, ...skipped],
  };
}

/** Why an artifact whose overlay was refused is skipped. */
function refusedReason(reason: string): string {
  return `${OVERLAYS_FILE} entry refused: ${reason}`;
}
