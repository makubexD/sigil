/**
 * The real handlers behind the home menu: one per entry, each calling the same `run*` function as
 * the matching `sigil <verb>` with the folder the menu is looking at. In a terminal those commands
 * are already guided (wizard, picker, preview-and-confirm), so the menu adds no logic of its own.
 *
 * @module
 */
import { resolveDefault, loadAndValidate } from '../cli-helpers';
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

/** Ids in the bundled catalog, so the header can count artifacts that have left it. */
async function bundledCatalogIds(): Promise<Set<string> | undefined> {
  try {
    const { catalog } = await loadAndValidate(bundled().catalogDir, bundled().packs);
    return new Set(catalog.artifacts.map(a => a.id));
  } catch {
    return undefined; // the header just skips the "orphaned" count
  }
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
    catalogIds: bundledCatalogIds,
    handlers: { ...handlers, browse, search, ...author, help },
  };
}
