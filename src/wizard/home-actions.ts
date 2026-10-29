/**
 * The real handlers behind the home menu: one per entry, each calling the same `run*` function as
 * the matching `sigil <verb>` with the folder the menu is looking at. In a terminal those commands
 * are already guided (wizard, picker, preview-and-confirm), so the menu adds no logic of its own.
 *
 * @module
 */
import { resolveDefault, loadAndValidate } from '../cli-helpers';
import { loadManifest } from '../manifest';
import { groupBySource } from '../manifest/catalog-source';
import type { SourceGroup } from '../manifest/catalog-source';
import { runAdd } from '../commands/add';
import { runInit } from '../commands/init';
import { runPrune } from '../commands/prune';
import { runRepair } from '../commands/repair-manifest';
import { restoreMissing } from '../commands/restore-missing';
import { runStatus } from '../commands/status';
import { runUninstall } from '../commands/uninstall';
import { runUpdate } from '../commands/update';
import { detectedTargetsIn, toolsToSetUp } from '../project-context';
import { browse, editArtifact, newArtifact, search, validateCatalog } from './home-browse';
import { chooseInstalledTarget } from './home-target';
import type { HomeDeps, HomeHandler } from './home';

const bundled = (): { catalogDir: string; packs: string } => ({
  catalogDir: resolveDefault('catalog'),
  packs: resolveDefault('packs.yaml'),
});

const install: HomeHandler = dir =>
  runAdd([], {
    projectDir: dir,
    ...bundled(),
    deps: true,
    dryRun: false,
    interactive: true,
    yes: false,
    overwrite: false,
    settingsLocal: false,
  });

const restore: HomeHandler = async dir => {
  const restored = await restoreMissing({ projectDir: dir, ...bundled() });
  console.log(
    restored.length > 0
      ? `\n✓ Restored ${restored.length} artifact(s): ${restored.join(', ')}\n`
      : '\n  Nothing could be restored. Run `sigil status` to see why.\n',
  );
};

/** Ids in one catalog, or `undefined` when it cannot be loaded or is invalid. */
async function idsIn(catalogDir: string, packs: string): Promise<Set<string> | undefined> {
  try {
    const { catalog } = await loadAndValidate(catalogDir, packs);
    return new Set(catalog.artifacts.map(a => a.id));
  } catch {
    return undefined;
  }
}

/**
 * Ids in every catalog `dir` is judged against: the bundled catalog plus each catalog its
 * manifest records, so an artifact installed from a team catalog is not counted as orphaned.
 * A recorded catalog that is missing or invalid is left out (its entries then show as orphaned,
 * which is the honest state), and an unreadable manifest leaves the bundled ids only. `undefined`
 * when the bundled catalog itself cannot be loaded, so the header skips the "orphaned" count.
 */
async function catalogIds(dir: string): Promise<Set<string> | undefined> {
  const ids = await idsIn(bundled().catalogDir, bundled().packs);
  if (ids === undefined) return undefined;
  let groups: SourceGroup[];
  try {
    groups = groupBySource(loadManifest(dir).entries, { projectDir: dir, ...bundled() });
  } catch {
    // A damaged manifest is the "repair" state, and a bad recorded catalog is reported by the
    // command run on it; neither is an orphaned-count error.
    return ids;
  }
  for (const group of groups) {
    if (group.source === undefined) continue;
    const recorded = await idsIn(group.catalogDir, group.packs);
    if (recorded === undefined) continue;
    for (const id of recorded) ids.add(id);
  }
  return ids;
}

/** Runs `run` for the tool the user means: asks only when more than one tool has installs. */
async function forInstalledTool(
  dir: string,
  run: (tool: { target?: string }) => Promise<void>,
): Promise<void> {
  const target = await chooseInstalledTarget(dir);
  if (target !== null) await run(target ? { target } : {});
}

const update: HomeHandler = dir =>
  forInstalledTool(dir, tool =>
    runUpdate([], { projectDir: dir, ...bundled(), force: false, dryRun: false, ...tool }),
  );

const uninstall: HomeHandler = dir =>
  forInstalledTool(dir, tool =>
    runUninstall([], { projectDir: dir, yes: false, force: false, dryRun: false, ...tool }),
  );

const status: HomeHandler = dir =>
  forInstalledTool(dir, tool => runStatus({ projectDir: dir, ...bundled(), json: false, ...tool }));

const prune: HomeHandler = dir =>
  forInstalledTool(dir, tool =>
    runPrune({
      projectDir: dir,
      ...bundled(),
      apply: false,
      yes: false,
      force: false,
      json: false,
      ...tool,
    }),
  );

const repair: HomeHandler = dir => runRepair(dir);

/** Offers only the tools this folder is not set up for yet, so the menu never re-creates what it shows. */
const init: HomeHandler = dir =>
  runInit({ projectDir: dir, only: toolsToSetUp(detectedTargetsIn(dir)) });

/** The handlers for `sigil` with no command. `showHelp` prints the root help. */
export function defaultHomeDeps(showHelp: () => void): HomeDeps {
  const help: HomeHandler = async () => showHelp();
  const author = { new: newArtifact, edit: editArtifact, validate: validateCatalog };
  const handlers = { init, install, repair, restore, update, uninstall, status, prune };
  return {
    catalogIds,
    handlers: { ...handlers, browse, search, ...author, help },
  };
}
