/**
 * What the home menu shows. Both functions are pure: the menu and the header depend only on a
 * `ProjectContext`, so every folder state can be tested without a terminal.
 *
 * @module
 */
import { recommendNext } from '../project-context';
import type { NextAction, ProjectContext } from '../project-context';
import { getAllTargets } from '../targets';

export type HomeActionId =
  | NextAction
  | 'uninstall'
  | 'browse'
  | 'search'
  | 'new'
  | 'edit'
  | 'validate'
  | 'help'
  | 'quit';

export interface MenuItem {
  value: HomeActionId;
  label: string;
  hint: string;
  recommended: boolean;
}

interface Entry {
  value: HomeActionId;
  label: string;
  hint: string;
  /** Hidden when this returns false for the folder's state. */
  shown: (ctx: ProjectContext) => boolean;
}

const always = (): boolean => true;
const hasInstalled = (ctx: ProjectContext): boolean => ctx.installed > 0;
const inCheckout = (ctx: ProjectContext): boolean => ctx.isCatalogCheckout;

/** Every entry in menu order. The recommended one is moved to the top at build time. */
const ENTRIES: readonly Entry[] = [
  {
    value: 'init',
    label: 'Set up this project',
    hint: 'Create the folders for Claude Code or Copilot',
    shown: ctx => ctx.detectedTargets.length === 0,
  },
  {
    value: 'install',
    label: 'Install artifacts',
    hint: 'Add skills, agents, rules and more',
    shown: always,
  },
  {
    value: 'restore',
    label: 'Restore deleted files',
    hint: 'Bring back files sigil installed that are gone',
    shown: ctx => ctx.health.missing > 0,
  },
  {
    value: 'update',
    label: 'Update installed artifacts',
    hint: 'Preview, then apply',
    shown: hasInstalled,
  },
  {
    value: 'uninstall',
    label: 'Remove artifacts',
    hint: 'Pick from what is installed',
    shown: hasInstalled,
  },
  {
    value: 'status',
    label: "Check what's installed",
    hint: 'Health of every installed artifact',
    shown: hasInstalled,
  },
  {
    value: 'prune',
    label: 'Clean up leftovers',
    hint: 'Artifacts that left the catalog',
    shown: hasInstalled,
  },
  { value: 'browse', label: 'Browse the catalog', hint: 'List artifacts by kind', shown: always },
  { value: 'search', label: 'Search the catalog', hint: 'Find one by keyword', shown: always },
  { value: 'new', label: 'Create a new artifact', hint: 'Guided authoring', shown: inCheckout },
  { value: 'edit', label: 'Edit an artifact', hint: 'Title, description, tags', shown: inCheckout },
  {
    value: 'validate',
    label: 'Validate the catalog',
    hint: 'Schema and reference checks',
    shown: inCheckout,
  },
  { value: 'change-folder', label: 'Work in a different folder', hint: '', shown: always },
  { value: 'help', label: 'Show all commands', hint: 'The full command list', shown: always },
  { value: 'quit', label: 'Quit', hint: '', shown: always },
];

/** The entries that apply to this folder, the top recommendation first and marked. */
export function buildMenu(ctx: ProjectContext): MenuItem[] {
  const top = recommendNext(ctx)[0];
  const items = ENTRIES.filter(entry => entry.shown(ctx)).map(entry => ({
    value: entry.value,
    label: entry.label,
    hint: entry.hint,
    recommended: false,
  }));
  const index = items.findIndex(item => item.value === top?.action);
  if (!top || index === -1) return items;
  const [item] = items.splice(index, 1);
  if (!item) return items;
  return [
    { ...item, label: `${item.label} (recommended)`, hint: top.reason, recommended: true },
    ...items,
  ];
}

const HEALTH_PHRASES: ReadonlyArray<readonly [keyof ProjectContext['health'], string]> = [
  ['missing', 'missing'],
  ['drifted', 'edited'],
  ['outdated', 'outdated'],
  ['orphaned', 'orphaned'],
];

function healthSummary(ctx: ProjectContext): string {
  const problems = HEALTH_PHRASES.filter(([key]) => ctx.health[key] > 0).map(
    ([key, word]) => `${ctx.health[key]} ${word}`,
  );
  return problems.length > 0 ? problems.join(', ') : 'all healthy';
}

function targetNames(ctx: ProjectContext): string {
  const named = getAllTargets().filter(t => ctx.detectedTargets.includes(t.name));
  return named.map(t => t.displayName ?? t.name).join(', ');
}

/** The few lines shown above the menu: where we are, what it is set up for, what is installed. */
export function describeContext(ctx: ProjectContext): string[] {
  const lines = [`Folder:     ${ctx.projectDir}`];
  lines.push(
    ctx.detectedTargets.length > 0
      ? `Set up for:  ${targetNames(ctx)}`
      : 'Set up for:  not set up yet (no .claude/ or .github/ folder)',
  );
  if (ctx.manifestError) {
    lines.push('Installed:  the install record could not be read — run `sigil status` for details');
  } else if (ctx.installed > 0) {
    lines.push(`Installed:  ${ctx.installed} installed · ${healthSummary(ctx)}`);
  } else {
    lines.push('Installed:  nothing yet');
  }
  return lines;
}
