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
import { stateHintSuffix, renderStateLegend } from '../../state-display';
import type { ResolvedCatalog } from '../../../types';

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
    const { ids } = resolveSelection([`pack:${pack.name}`], {}, catalog, packs, []);
    const kindCounts = new Map<string, number>();
    let hasDepsClosure = false;
    for (const id of ids) {
      const a = catalog.byId.get(id);
      if (!a) continue;
      kindCounts.set(a.kind, (kindCounts.get(a.kind) ?? 0) + 1);
      if (hasUsesClosure(a.kind)) hasDepsClosure = true;
    }
    // Display order from kinds.ts (config first, then code kinds — single source of truth).
    const displayOrder = ALL_KINDS;
    const parts: string[] = [];
    for (const k of displayOrder) {
      const count = kindCounts.get(k);
      if (!count) continue;
      const label = count === 1 ? kindNoun(target, k) : kindPlural(target, k);
      parts.push(`${count} ${label}`);
    }
    for (const k of KIND_ORDER) {
      if (!displayOrder.includes(k as ArtifactKind)) {
        const count = kindCounts.get(k);
        if (count) parts.push(`${count} ${kindPlural(target, k)}`);
      }
    }
    if (hasDepsClosure) parts.push('+deps');
    return parts.join(' · ') || pack.displayName;
  } catch {
    return pack.displayName;
  }
}

export interface PickerOption {
  value: string;
  label: string;
  hint: string;
}

/** Builds the "id (kindNoun) — hint" option for one artifact, tagged with its install state. */
export function toArtifactOption(
  a: ResolvedArtifact,
  target: Target | undefined,
  installStates: Map<string, ArtifactInstallState> | undefined,
): PickerOption {
  const is = installStates?.get(a.id);
  return {
    value: `${a.kind}:${a.id}`,
    label: `${a.id}  (${kindNoun(target, a.kind)})`,
    hint: `${stateHintSuffix(is?.state)}  — ${artifactHint(a)}`,
  };
}

/** Renders the install-state legend note body for a set of artifacts, or undefined if none apply. */
export function legendFor(
  items: ResolvedArtifact[],
  installStates: Map<string, ArtifactInstallState> | undefined,
): string | undefined {
  return renderStateLegend(items, installStates);
}
