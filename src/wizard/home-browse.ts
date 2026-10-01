/**
 * The home menu's catalog entries: browse, search (then details, then install) and, inside a
 * catalog checkout, the author actions. Each one calls the same `run*` function as the matching
 * `sigil <verb>`; nothing is reimplemented here.
 *
 * @module
 */
import path from 'node:path';
import { cancel, confirm, isCancel, select, text } from '@clack/prompts';
import { resolveDefault } from '../cli-helpers';
import { ALL_KINDS } from '../kinds';
import { runAdd } from '../commands/add';
import { runEdit } from '../commands/edit';
import { runGet } from '../commands/get';
import { runList } from '../commands/list';
import { runNew } from '../commands/new';
import { runSearch } from '../commands/search';
import { runValidate } from '../commands/validate';
import { detectProjectContext } from '../project-context';
import { confirmInstallFolder } from './folder-guard';
import type { HomeHandler } from './home';

const CATALOG = (): string => resolveDefault('catalog');
const PACKS = (): string => resolveDefault('packs.yaml');
const ALL = '__all__';

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
};

export const search: HomeHandler = async dir => {
  const query = await ask('Search for (a word or two):');
  if (!query) return;
  await runSearch(query, { catalogDir: CATALOG(), json: false });
  const id = await ask('Type an id from the results to see its details (Enter goes back):');
  if (id) await detailsThenInstall(id, dir);
};

/** Shows one artifact, then offers to install it into the folder the menu is looking at. */
async function detailsThenInstall(id: string, dir: string): Promise<void> {
  await runGet(id, { catalogDir: CATALOG(), json: false });
  if (!(await confirmInstallFolder(detectProjectContext(dir)))) return;
  const install = await confirm({ message: `Install ${id} into ${dir}?`, initialValue: false });
  if (isCancel(install) || !install) return;
  await runAdd([id], {
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
