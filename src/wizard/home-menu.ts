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
/** True while some tool (Claude Code, Copilot) has no folders here yet, so a second one can be added. */
const hasToolToSetUp = (ctx: ProjectContext): boolean =>
  getAllTargets().some(t => (t.initDirs?.length ?? 0) > 0 && !ctx.detectedTargets.includes(t.name));

/** Every entry in menu order. The recommended one is moved to the top at build time. */
const ENTRIES: readonly Entry[] = [
  {
    value: 'init',
    label: 'Set up this project',
    hint: 'Create the folders for Claude Code or Copilot',
    shown: hasToolToSetUp,
  },
  {
    value: 'repair',
    label: 'Repair the install record',
    hint: 'Set the damaged file aside and start a fresh record',
    shown: ctx => ctx.manifestError !== undefined,
  },
  {
    value: 'install',
    label: 'Install artifacts',
    hint: 'Add skills, agents, rules and more',
    shown: ctx => ctx.manifestError === undefined,
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

/** The top recommendation: marked, and its hint says what the entry does and why it is first. */
function markRecommended(item: MenuItem, reason: string): MenuItem {
  return {
    ...item,
    label: `${item.label} (recommended)`,
    hint: item.hint ? `${item.hint}. ${reason}` : reason,
    recommended: true,
  };
}

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
  return item ? [markRecommended(item, top.reason), ...items] : items;
}

const HEALTH_PHRASES: ReadonlyArray<readonly [keyof ProjectContext['health'], string]> = [
  ['missing', 'missing'],
  ['drifted', 'edited'],
  ['outdated', 'outdated'],
  ['orphaned', 'no longer in the catalog'],
];

function healthSummary(ctx: ProjectContext): string {
  const problems = HEALTH_PHRASES.filter(([key]) => ctx.health[key] > 0).map(
    ([key, word]) => `${ctx.health[key]} ${word}`,
  );
  return problems.length > 0 ? problems.join(', ') : 'all healthy';
}

const displayName = (name: string): string =>
  getAllTargets().find(t => t.name === name)?.displayName ?? name;

function targetNames(ctx: ProjectContext): string {
  return ctx.detectedTargets.map(displayName).join(', ');
}

/** "3 installed", or "3 Claude Code, 2 GitHub Copilot" when more than one tool has installs. */
function installedSummary(ctx: ProjectContext): string {
  const perTarget = Object.entries(ctx.installedByTarget);
  if (perTarget.length <= 1) return `${ctx.installed} installed`;
  return perTarget.map(([name, count]) => `${count} ${displayName(name)}`).join(', ');
}

const LABEL_WIDTH = 13;
const row = (label: string, value: string): string => `${label.padEnd(LABEL_WIDTH)}${value}`;

function installedLine(ctx: ProjectContext): string {
  if (ctx.manifestError) {
    return row(
      'Installed:',
      "the install record is damaged — choose 'Repair the install record' below",
    );
  }
  if (ctx.installed === 0) return row('Installed:', 'nothing yet');
  return row('Installed:', `${installedSummary(ctx)} · ${healthSummary(ctx)}`);
}

/** The few lines shown above the menu: where we are, what it is set up for, what is installed. */
export function describeContext(ctx: ProjectContext): string[] {
  const setUp =
    ctx.detectedTargets.length > 0
      ? targetNames(ctx)
      : 'not set up yet (no Claude Code or Copilot setup found)';
  return [row('Folder:', ctx.projectDir), row('Set up for:', setUp), installedLine(ctx)];
}
