/**
 * Install-state display helpers for the wizard pickers.
 *
 * These are pure functions — no I/O, no clack calls.
 * They format hint text and legend content from install-state data.
 */
import pc from 'picocolors';
import type { ArtifactInstallState, InstallState } from '../install-state';

/**
 * Short hint annotation for an artifact install state (colored).
 * Returned string is used as a `hint` field in clack picker options.
 */
export function stateHintSuffix(state: InstallState | undefined): string {
  switch (state) {
    case 'up-to-date':
      return pc.dim('✓ installed');
    case 'drifted':
      return pc.yellow('✎ you edited this');
    case 'outdated':
      return pc.cyan('↑ new version available');
    case 'missing':
      return pc.cyan('! missing from disk');
    case 'foreign':
      return pc.yellow('⚠ not installed by sigil');
    default:
      return pc.green('＋ new');
  }
}

/**
 * Renders a compact legend explaining state glyphs.
 * Returns an empty string when every item is new/absent (no installed state to explain),
 * so the legend is omitted on a first-run destination where nothing is installed yet.
 */
export function renderStateLegend(
  items: Array<{ id: string }>,
  installStates: Map<string, ArtifactInstallState> | undefined,
): string {
  if (!installStates || items.length === 0) return '';
  const hasInstalledState = items.some(a => {
    const st = installStates.get(a.id)?.state;
    return st !== undefined && st !== 'new';
  });
  if (!hasInstalledState) return '';
  return [
    `${pc.green('＋ new')}   ${pc.dim('✓ installed')}   ${pc.cyan('↑ update available')}   ${pc.yellow('✎ you edited')}   ${pc.yellow("⚠ not sigil's")}`,
    `Nothing is pre-checked — check the items you want to install (glyphs show current state).`,
  ].join('\n');
}
