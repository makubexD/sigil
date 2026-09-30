/**
 * Shared picker-option builders for the `add` wizard steps — kills the 5 copies of
 * the same "id (kindNoun) — hint" option-building block that existed in the
 * monolithic runWizard, plus the pack-content-summary and install-state-summary hints.
 *
 * @module
 */
import type { Pack, ResolvedArtifact, Target, ArtifactKind } from '../../../types';
import { artifactHint, resolveSelection, kindNoun, kindPlural, KIND_ORDER } from '../../../select';
import { ALL_KINDS, hasUsesClosure } from '../../../kinds';
import type { ArtifactInstallState } from '../../../install-state';
import { stateLabelParts, renderStateLegend } from '../../state-display';
import type { ResolvedCatalog } from '../../../types';
import type { ItemRow } from '../../picker';

/** Build a per-picker header summary like "  (3 already installed, 1 new)". */
export function buildPickerSummary(
  items: Array<{ id: string }>,
  installStates: Map<string, ArtifactInstallState> | undefined,
): string {
  if (!installStates || items.length === 0) return '';
  const installed = items.filter(a => installStates.get(a.id)?.state === 'up-to-date').length;
  const isNew = items.filter(a => {
    const st = installStates.get(a.id)?.state;
    return st === 'new' || st === undefined;
  }).length;
  const parts: string[] = [];
  if (installed > 0) parts.push(`${installed} already installed`);
  if (isNew > 0) parts.push(`${isNew} new`);
  return parts.length > 0 ? `  (${parts.join(', ')})` : '';
}

/** Counts each resolved id's kind, and whether any resolved artifact has a uses-closure. */
function countKinds(
  ids: string[],
  catalog: ResolvedCatalog,
): { counts: Map<string, number>; hasDepsClosure: boolean } {
  const counts = new Map<string, number>();
  let hasDepsClosure = false;
  for (const id of ids) {
    const a = catalog.byId.get(id);
    if (!a) continue;
    counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1);
    if (hasUsesClosure(a.kind)) hasDepsClosure = true;
  }
  return { counts, hasDepsClosure };
}

/** Renders "<count> <label>" parts in display order (config kinds first, then code kinds). */
function renderKindCountParts(
  kindCounts: Map<string, number>,
  target: Target | undefined,
): string[] {
  const parts: string[] = [];
  for (const k of ALL_KINDS) {
    const count = kindCounts.get(k);
    if (!count) continue;
    parts.push(`${count} ${count === 1 ? kindNoun(target, k) : kindPlural(target, k)}`);
  }
  for (const k of KIND_ORDER) {
    if (ALL_KINDS.includes(k as ArtifactKind)) continue;
    const count = kindCounts.get(k);
    if (count) parts.push(`${count} ${kindPlural(target, k)}`);
  }
  return parts;
}

/** Resolves a pack's member ids via the `pack:<name>` selector. */
function resolvePackIds(pack: Pack, catalog: ResolvedCatalog, packs: Pack[]): string[] {
  return resolveSelection({
    selectors: [`pack:${pack.name}`],
    filters: {},
    catalog,
    packs,
    supportedKinds: [],
  }).ids;
}

/**
 * Builds a short content-summary hint for a pack option in the "Which bundle?" picker.
 * E.g. "2 MCP servers · 1 hook · 1 settings · 1 skill (+deps)"
 * Falls back to the pack displayName when expansion fails.
 */
export function packContentHint(
  pack: Pack,
  catalog: ResolvedCatalog,
  packs: Pack[],
  target: Target | undefined,
): string {
  try {
    const { counts, hasDepsClosure } = countKinds(resolvePackIds(pack, catalog, packs), catalog);
    const parts = renderKindCountParts(counts, target);
    if (hasDepsClosure) parts.push('+deps');
    return parts.join(' · ') || pack.displayName;
  } catch {
    return pack.displayName;
  }
}

/** Builds the picker row for one artifact: structured fields, not a pre-joined label string — see
 * `src/wizard/picker/` for why (fixed-column alignment + a detail pane instead of an inline hint). */
export function toArtifactOption(
  a: ResolvedArtifact,
  target: Target | undefined,
  installStates: Map<string, ArtifactInstallState> | undefined,
): ItemRow {
  const is = installStates?.get(a.id);
  const { glyph, label } = stateLabelParts(is?.state);
  return {
    kind: 'item',
    value: `${a.kind}:${a.id}`,
    id: a.id,
    kindNoun: kindNoun(target, a.kind),
    stateGlyph: glyph,
    stateLabel: label,
    description: artifactHint(a),
  };
}

/** Renders the install-state legend note body for a set of artifacts, or undefined if none apply. */
export function legendFor(
  items: ResolvedArtifact[],
  installStates: Map<string, ArtifactInstallState> | undefined,
): string | undefined {
  return renderStateLegend(items, installStates);
}
