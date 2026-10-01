/**
 * Pick from what is installed. Used by the guided `uninstall` and `update` so nobody has to know
 * artifact ids: each option shows the artifact's kind, its health, and which other installed
 * artifacts require it.
 *
 * @module
 */
import { multiselect, isCancel, cancel } from '@clack/prompts';
import { computeStatus } from '../manifest';
import type { ManifestEntry, StatusResult } from '../manifest/types';
import { stateLabelParts } from './state-display';

export interface InstalledOption {
  value: string;
  label: string;
  hint: string;
}

export interface PickInstalledOptions {
  entries: ManifestEntry[];
  projectDir: string;
  message: string;
}

const CANCEL_MESSAGE = 'Cancelled. Nothing was changed.';

function stateText(status: StatusResult['status']): string {
  if (status === 'orphaned') return '⚠ no longer in the catalog';
  const { glyph, label } = stateLabelParts(status);
  return `${glyph} ${label}`;
}

/** One option per installed artifact, in manifest order. Pure, so it can be tested without a prompt. */
export function installedOptions(
  entries: readonly ManifestEntry[],
  statuses: readonly StatusResult[],
): InstalledOption[] {
  const statusById = new Map(statuses.map(s => [s.entry.id, s.status]));
  return entries.map(entry => {
    const parts = [entry.kind, stateText(statusById.get(entry.id) ?? 'up-to-date')];
    if (entry.dependentOf.length > 0) parts.push(`required by ${entry.dependentOf.join(', ')}`);
    return { value: entry.id, label: entry.id, hint: parts.join(' · ') };
  });
}

/** Multi-select of installed artifacts. Returns the chosen ids, or `null` when the user cancels. */
export async function pickInstalled(options: PickInstalledOptions): Promise<string[] | null> {
  const { entries, projectDir, message } = options;
  const known = new Set(entries.map(e => e.id));
  const statuses = computeStatus({ manifestVersion: 2, entries }, projectDir, known);
  const answer = await multiselect({
    message: `${message}  (Space ticks, Enter confirms, Ctrl+C goes back)`,
    options: installedOptions(entries, statuses),
    required: true,
  });
  if (isCancel(answer)) {
    cancel(CANCEL_MESSAGE);
    return null;
  }
  return answer as string[];
}
