/**
 * The home menu: what bare `sigil` opens in a terminal. It looks at the folder, shows what it
 * found, suggests the next step, runs whatever the user picks through the same code path as the
 * matching `sigil <verb>`, and returns to the menu until the user quits.
 *
 * Handlers are injected (see `home-actions.ts` for the real ones) so the loop is testable without
 * installing anything.
 *
 * @module
 */
import os from 'node:os';
import { intro, isCancel, log, note, outro, select } from './prompts';
import { detectProjectContext } from '../project-context';
import type { NextAction, ProjectContext } from '../project-context';
import { SigilError } from '../errors';
import { guardFolder } from './folder-guard';
import type { GuardedFolder } from './folder-guard';
import { pickFolder } from './folder-picker';
import { runInHomeFrame, withGutter } from './frame';
import { describeTerminal } from './terminal';
import { buildMenu, describeContext, topRecommendation } from './home-menu';
import type { HomeActionId, MenuItem } from './home-menu';
import { buildNextMenu, nextSummary } from './home-next';
import type { FinishedAction } from './home-next';

/**
 * Runs one action against the folder the menu is currently looking at. It returns `'cancelled'`
 * when the user backed out, so the menu does not count that as an action that changed nothing.
 */
export type HomeHandler = (projectDir: string) => Promise<void | 'cancelled'>;

export interface HomeDeps {
  handlers: Partial<Record<HomeActionId, HomeHandler>>;
  /** Ids in the bundled catalog, so orphaned artifacts can be spotted. Optional. */
  catalogIds?: () => Promise<Set<string> | undefined>;
  /** Overridable so tests never depend on the real home folder. */
  homeDir?: string;
}

const PERMISSION_CODES = new Set(['EACCES', 'EPERM', 'EROFS']);
const PERMISSION_HINT =
  "sigil can't write here. Pick a different folder, or check that this one is not read-only or locked by another program (an editor, a sync tool, antivirus).";

const isPermissionError = (error: unknown): boolean =>
  error instanceof Error && PERMISSION_CODES.has((error as NodeJS.ErrnoException).code ?? '');

/** Shows an action's failure as a message, with what to try next, and keeps the menu alive. */
function showError(error: unknown): void {
  if (error instanceof SigilError) {
    log.error(error.message);
    if (error.hint) log.info(error.hint.trim());
    return;
  }
  log.error(error instanceof Error ? error.message : String(error));
  if (isPermissionError(error)) log.info(PERMISSION_HINT);
}

/** How a handler ended: it ran to the end, the user backed out, or it failed (the error was shown). */
type HandlerEnd = 'done' | 'cancelled' | 'failed';

/**
 * Runs an action's handler, showing its failure instead of leaving the menu. The verb's plain
 * output is drawn inside the menu's gutter. A failure still counts as having run, so a failing
 * suggestion is not repeated; a back-out does not.
 */
async function runHandler(choice: HomeActionId, dir: string, deps: HomeDeps): Promise<HandlerEnd> {
  const handler = deps.handlers[choice];
  if (!handler) {
    log.warn(`'${choice}' is not available here.`);
    return 'cancelled';
  }
  try {
    return (await withGutter(() => handler(dir))) === 'cancelled' ? 'cancelled' : 'done';
  } catch (error) {
    showError(error);
    return 'failed';
  }
}

/** Actions that write into the folder, and how the folder question names them ("install there"). */
const GUARDED: Partial<Record<HomeActionId, string>> = {
  install: 'install',
  init: 'set up the project',
};

interface ChoiceResult {
  /** The folder to use next. */
  dir: string;
  /** The user was warned about a risky folder and said to go ahead. */
  acknowledgedRisk: boolean;
  /** The action ran to the end: it was not backed out of or cancelled. */
  completed: boolean;
  /** The action ran to the end and did not fail. */
  succeeded: boolean;
}

/** What `runChoice` needs besides the menu choice itself. */
interface Env {
  deps: HomeDeps;
  catalogIds: Set<string> | undefined;
  /** The user already said to go ahead in this folder, so the risky-folder question is not repeated. */
  riskAccepted: boolean;
}

const homeOf = (env: Env): string => env.deps.homeDir ?? os.homedir();

/** The folder `choice` writes to: the current one, or after the risky-folder question another one. */
async function settleFolder(
  choice: HomeActionId,
  ctx: ProjectContext,
  env: Env,
): Promise<GuardedFolder | null> {
  const verb = GUARDED[choice];
  if (verb === undefined || env.riskAccepted) return { ctx, acknowledgedRisk: false };
  const read = (dir: string): ProjectContext => readContext(dir, env.catalogIds, env.deps);
  return guardFolder(ctx, verb, { read, homeDir: homeOf(env) });
}

/** The current folder is labelled and not preselected, so Enter alone never picks it again. */
async function changeFolder(dir: string, env: Env): Promise<string> {
  return (await pickFolder(dir, homeOf(env), { leaving: dir })) ?? dir;
}

/** Runs one menu choice. An action that writes first settles which folder it writes to. */
async function runChoice(
  choice: HomeActionId,
  ctx: ProjectContext,
  env: Env,
): Promise<ChoiceResult> {
  const stay = {
    dir: ctx.projectDir,
    acknowledgedRisk: false,
    completed: false,
    succeeded: false,
  };
  if (choice === 'change-folder') return { ...stay, dir: await changeFolder(ctx.projectDir, env) };
  const guarded = await settleFolder(choice, ctx, env);
  if (!guarded) return stay;
  const dir = guarded.ctx.projectDir;
  const end = await runHandler(choice, dir, env.deps);
  const acknowledgedRisk = guarded.acknowledgedRisk;
  return { dir, acknowledgedRisk, completed: end !== 'cancelled', succeeded: end === 'done' };
}

const baseLabel = (label: string): string => label.replace(/ \(recommended\)$/, '');

/**
 * What the loop remembers about this folder. `dismissed` holds suggestions that stopped being useful:
 * they stay in the menu, just unmarked, so a suggestion no action can resolve (or one the user waved
 * off) is not repeated forever. It resets when the folder changes.
 */
interface Session {
  dir: string;
  dismissed: Set<NextAction>;
  /** The recommended action the user just ran, to see whether it changed anything. */
  lastRun: { action: HomeActionId; label: string } | undefined;
  /** An install or a set up just finished, so the next turn offers the short "What next?" menu. */
  after: FinishedAction | undefined;
  /** The user went ahead past the risky-folder warning in this folder; it is not asked again. */
  riskAccepted: boolean;
}

/** The action just run is still the top suggestion: nothing it did helped, so stop marking it. */
function dismissIfStuck(session: Session, ctx: ProjectContext): void {
  const { lastRun } = session;
  session.lastRun = undefined;
  if (!lastRun || topRecommendation(ctx, session.dismissed)?.action !== lastRun.action) return;
  session.dismissed.add(lastRun.action as NextAction);
  log.info(
    `Nothing changed after "${lastRun.label}", so it is no longer marked as recommended here.`,
  );
}

/** Updates the session after a choice ran: a new folder, an accepted warning, or a recommended action to check. */
function recordChoice(
  session: Session,
  picked: HomeActionId,
  menu: MenuItem[],
  result: ChoiceResult,
): void {
  const moved = result.dir !== session.dir;
  if (moved) moveSession(session, result.dir);
  if (result.succeeded && (picked === 'install' || picked === 'init')) session.after = picked;
  if (result.acknowledgedRisk) rememberRisk(session);
  else if (!moved && result.completed) rememberRecommended(session, picked, menu);
}

/** A recommended action just ran: remember it, so the next turn can tell whether it helped. */
function rememberRecommended(session: Session, picked: HomeActionId, menu: MenuItem[]): void {
  const item = menu.find(entry => entry.value === picked);
  if (!item?.recommended || picked === 'change-folder') return;
  session.lastRun = { action: picked, label: baseLabel(item.label) };
}

/** The user went ahead past the warning: stop suggesting another folder, and stop asking here. */
function rememberRisk(session: Session): void {
  session.dismissed.add('change-folder');
  session.riskAccepted = true;
}

/** A new folder starts clean: its own suggestions, its own risky-folder answer. */
function moveSession(session: Session, dir: string): void {
  session.dir = dir;
  session.dismissed = new Set();
  session.riskAccepted = false;
}

/** Reads the folder fresh each turn: what the menu shows must reflect what the last action did. */
function readContext(
  dir: string,
  catalogIds: Set<string> | undefined,
  deps: HomeDeps,
): ProjectContext {
  return detectProjectContext(dir, {
    ...(catalogIds ? { catalogIds } : {}),
    ...(deps.homeDir ? { homeDir: deps.homeDir } : {}),
  });
}

/** A menu's rows as clack options. */
const toOptions = (menu: MenuItem[]) =>
  menu.map(({ value, label, hint }) => ({ value, label, hint }));

interface Picked {
  action: HomeActionId;
  menu: MenuItem[];
}

/** The full menu under the "This folder" box. `null` when the user quits. */
async function askFull(ctx: ProjectContext, session: Session): Promise<Picked | null> {
  note(describeContext(ctx).join('\n'), 'This folder');
  const menu = buildMenu(ctx, { dismissed: session.dismissed });
  const choice = await select({ message: 'What would you like to do?', options: toOptions(menu) });
  return isCancel(choice) || choice === 'quit' ? null : { action: choice as HomeActionId, menu };
}

/**
 * Right after an install or a set up, a short menu with the usual next steps instead of the box
 * and the full list. It falls through to the full menu on "Show all options", and when something
 * more urgent than installing is recommended. `null` when the user is done.
 */
async function askNext(ctx: ProjectContext, session: Session): Promise<Picked | null> {
  const next = session.after && buildNextMenu(ctx, session.after, { dismissed: session.dismissed });
  session.after = undefined;
  if (!next) return askFull(ctx, session);
  log.success(nextSummary(ctx));
  const choice = await select({ message: 'What next?', options: toOptions(next) });
  if (isCancel(choice) || choice === 'quit') return null;
  return choice === 'all' ? askFull(ctx, session) : { action: choice as HomeActionId, menu: next };
}

async function homeLoop(projectDir: string, deps: HomeDeps): Promise<void> {
  const session: Session = {
    dir: projectDir,
    dismissed: new Set(),
    lastRun: undefined,
    after: undefined,
    riskAccepted: false,
  };
  if (process.env['SIGIL_DEBUG'] === 'terminal') log.info(describeTerminal());
  const catalogIds = await deps.catalogIds?.();
  for (;;) {
    const ctx = readContext(session.dir, catalogIds, deps);
    dismissIfStuck(session, ctx);
    const picked = await askNext(ctx, session);
    if (!picked) return;
    const env: Env = { deps, catalogIds, riskAccepted: session.riskAccepted };
    recordChoice(session, picked.action, picked.menu, await runChoice(picked.action, ctx, env));
  }
}

export async function runHome(projectDir: string, deps: HomeDeps): Promise<void> {
  intro('sigil');
  await runInHomeFrame(() => homeLoop(projectDir, deps));
  outro('Bye. Run `sigil` any time to come back.');
}
