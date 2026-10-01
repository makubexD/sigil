/**
 * The home menu's catalog entries: browse, search (then details, then install) and, inside a
 * catalog checkout, the author actions. Each one calls the same `run*` function as the matching
 * `sigil <verb>`; nothing is reimplemented here.
 *
 * @module
 */
import path from 'node:path';
import { cancel, confirm, isCancel, log, select, text } from '@clack/prompts';
import { resolveDefault } from '../cli-helpers';
import { loadCatalog } from '../load';
import { resolveCatalog } from '../resolve';
import { searchArtifacts } from '../query';
import { computeClosure } from '../select';
import type { ResolvedCatalog } from '../types';
import { ALL_KINDS } from '../kinds';
import { runAdd } from '../commands/add';
import { runEdit } from '../commands/edit';
import { runGet } from '../commands/get';
import { runList } from '../commands/list';
import { runNew } from '../commands/new';
import { runValidate } from '../commands/validate';
import { detectProjectContext } from '../project-context';
import { confirmInstallFolder } from './folder-guard';
import type { HomeHandler } from './home';

const CATALOG = (): string => resolveDefault('catalog');
const PACKS = (): string => resolveDefault('packs.yaml');
const ALL = '__all__';
const BACK = '::back';
const RESULTS_VISIBLE = 12;

/** A text answer, or null when the user cancelled or left it empty. */
async function ask(message: string): Promise<string | null> {
  const answer = await text({ message });
  if (isCancel(answer)) {
    cancel('Back to the menu.');
    return null;
  }
  const trimmed = String(answer).trim();
  return trimmed === '' ? null : trimmed;
}

export const browse: HomeHandler = async () => {
  const kind = await select({
    message: 'Which kind of artifact?',
    options: [
      { value: ALL, label: 'All kinds' },
      ...ALL_KINDS.map(value => ({ value, label: value })),
    ],
  });
  if (isCancel(kind)) return;
  await runList({ catalogDir: CATALOG(), ...(kind === ALL ? {} : { kind: String(kind) }) });
  log.info('To install one of these, choose "Install artifacts" or "Search the catalog".');
};

/** Pick one of the search results from a list, so nobody has to copy an id. null = back. */
async function pickResult(results: ReturnType<typeof searchArtifacts>): Promise<string | null> {
  const choice = await select({
    message: `${results.length} match(es). Pick one to see its details`,
    options: [
      ...results.map(r => ({
        value: r.artifact.id,
        label: `${r.artifact.kind}:${r.artifact.id}`,
        hint: String(r.artifact.frontmatter.title ?? ''),
      })),
      { value: BACK, label: 'Back to the menu' },
    ],
    maxItems: RESULTS_VISIBLE,
  });
  return isCancel(choice) || choice === BACK ? null : String(choice);
}

export const search: HomeHandler = async dir => {
  const query = await ask('Search for (a word or two):');
  if (!query) return;
  const resolved = resolveCatalog(await loadCatalog(CATALOG()));
  const results = searchArtifacts(resolved, query);
  if (results.length === 0) {
    log.info(`No matches for '${query}'. Try another word, or choose "Browse the catalog".`);
    return;
  }
  const id = await pickResult(results);
  if (id) await detailsThenInstall(id, dir, resolved);
};

/** "It also installs: a, b" for the helpers (rules, agents) a skill pulls in; empty when none. */
function helpersNote(id: string, resolved: ResolvedCatalog): string {
  const helpers = computeClosure([id], resolved).dependencies.map(d => d.artifact.id);
  return helpers.length > 0
    ? ` It also installs ${helpers.length} helper(s): ${helpers.join(', ')}.`
    : '';
}

/** Installs one catalog artifact (and its helpers) into `dir` through the same path as `sigil add`. */
const installOne = (id: string, dir: string): Promise<void> =>
  runAdd([id], {
    projectDir: dir,
    catalogDir: CATALOG(),
    packs: PACKS(),
    deps: true,
    dryRun: false,
    interactive: false,
    yes: false,
    overwrite: false,
    settingsLocal: false,
  });

/** Shows one artifact, then offers to install it into the folder the menu is looking at. */
async function detailsThenInstall(
  id: string,
  dir: string,
  resolved: ResolvedCatalog,
): Promise<void> {
  await runGet(id, { catalogDir: CATALOG(), json: false });
  if (!(await confirmInstallFolder(detectProjectContext(dir)))) return;
  const message = `Install ${id} into ${dir}?${helpersNote(id, resolved)}`;
  const install = await confirm({ message, initialValue: false });
  if (!isCancel(install) && install) await installOne(id, dir);
}

/** Author actions work on the checkout's own `catalog/` and `packs.yaml`, not the bundled ones. */
const checkout = (dir: string): { catalogDir: string; packs: string } => ({
  catalogDir: path.join(dir, 'catalog'),
  packs: path.join(dir, 'packs.yaml'),
});

export const newArtifact: HomeHandler = async dir => {
  await runNew(undefined, { catalogDir: checkout(dir).catalogDir, interactive: true });
};

export const editArtifact: HomeHandler = async dir => {
  const id = await ask('Id of the artifact to edit (for example shared/git):');
  if (id) await runEdit(id, { catalogDir: checkout(dir).catalogDir });
};

export const validateCatalog: HomeHandler = async dir => {
  await runValidate(checkout(dir));
};
