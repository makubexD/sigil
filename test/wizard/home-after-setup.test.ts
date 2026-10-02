/**
 * What happens after an install or a set up finishes inside the home menu: the whole session is one
 * frame, the short "What next?" menu replaces the full list, and nothing is asked twice. These run the
 * real install wizard end to end against a one-rule pack, so a nested intro/outro or a stray line
 * outside the gutter fails here.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runAdd } from '../../dist-cli/commands/add';
import type { AddOpts } from '../../dist-cli/commands/add';
import type { HomeDeps } from '../../dist-cli/wizard/home';
import { defaultHomeDeps } from '../../dist-cli/wizard/home-actions';
import { FOLDER_CHOICE } from '../../dist-cli/wizard/folder-list';
import { ENTER } from '../helpers/clack-mock';
import { withTempDirAsync } from '../helpers/temp-dir';
import {
  CANCEL,
  CATALOG_DIR,
  GUARD,
  PACKS_FILE,
  PACK_QUESTION,
  SCOPE,
  TOOL_QUESTION,
  asked,
  enterExcept,
  flow,
  journey,
  makeCheckout,
  makeProject,
  menus,
  nexts,
} from '../helpers/home-flow';

const MINI_PACKS = `packs:
  - name: mini
    displayName: Mini
    description: One rule, so a whole install through the real wizard stays small.
    artifacts:
      - shared/git
`;
const MINI_RULE = '.claude/rules/shared-git.md';
/** The answers that take the real install wizard from "What would you like to install?" to done. */
const INSTALL_MINI = ['pack', 'pack:mini', 'proceed'];
const SETUP_FLOW = ['menu', 'guard', 'scope', 'pack', 'proceed', 'next'];

async function inRoot(fn: (root: string) => Promise<void>): Promise<void> {
  await withTempDirAsync(fn, 'sigil-after-');
}

function addOpts(dir: string, extra: Partial<AddOpts> = {}): AddOpts {
  return {
    projectDir: dir,
    catalogDir: CATALOG_DIR,
    packs: PACKS_FILE,
    deps: true,
    dryRun: false,
    interactive: false,
    yes: false,
    overwrite: false,
    settingsLocal: false,
    ...extra,
  };
}

/** The real handlers, except Install uses a one-rule pack so the real wizard stays small. */
function miniInstallDeps(root: string): HomeDeps {
  const packs = path.join(root, 'mini-packs.yaml');
  fs.writeFileSync(packs, MINI_PACKS);
  const deps = defaultHomeDeps(() => {});
  const install = (dir: string): Promise<void | 'cancelled'> =>
    runAdd([], addOpts(dir, { packs, interactive: true }));
  return { ...deps, handlers: { ...deps.handlers, install } };
}

const marked = (p: { options: Array<{ label: string }> } | undefined, what: RegExp): boolean =>
  (p?.options ?? []).some(o => what.test(o.label) && /\(recommended\)/.test(o.label));

describe('after a setup: one frame, a short menu, no repeated questions', () => {
  async function inCheckout(fn: (dir: string, deps: HomeDeps) => Promise<void>): Promise<void> {
    await inRoot(async root => {
      const dir = path.join(root, 'work');
      makeCheckout(dir);
      fs.mkdirSync(path.join(dir, '.claude'));
      await fn(dir, miniInstallDeps(root));
    });
  }

  it('S11: an install from a checkout draws one frame and ends on a short menu with Done first', async () => {
    await inCheckout(async (dir, deps) => {
      const rec = await journey(dir, ['install', 'go', ...INSTALL_MINI, ENTER], { deps });
      assert.deepEqual(flow(rec), SETUP_FLOW);
      assert.equal(rec.frames.length, 2);
      assert.ok(rec.logs.includes('step: Running install…'));
      assert.deepEqual(
        nexts(rec)[0]?.options.map(o => o.value),
        ['quit', 'install', 'status', 'init', 'all'],
      );
      assert.match(rec.logs.find(l => /^success: /.test(l)) ?? '', /Claude Code: 1 installed/);
      assert.equal(fs.existsSync(path.join(dir, MINI_RULE)), true);
    });
  });

  it('S12: "Install more" asks neither the folder question nor the tool question, nor repeats the intro box', async () => {
    await inCheckout(async (dir, deps) => {
      const answers = ['install', 'go', ...INSTALL_MINI, 'install', CANCEL, 'quit'];
      const rec = await journey(dir, answers, { deps });
      assert.deepEqual(flow(rec), [...SETUP_FLOW, 'scope', 'menu']);
      assert.equal(asked(rec, TOOL_QUESTION).length, 0);
      assert.equal(rec.notes.filter(n => n.title === 'How this works').length, 1);
    });
  });

  it('S13: setting up the other tool from the short menu asks nothing and leads to Install', async () => {
    await inCheckout(async (dir, deps) => {
      const rec = await journey(dir, ['install', 'go', ...INSTALL_MINI, 'init', 'quit'], { deps });
      assert.equal(asked(rec, GUARD).length, 1);
      assert.equal(fs.existsSync(path.join(dir, '.github/prompts')), true);
      assert.deepEqual(
        nexts(rec)[1]?.options.map(o => o.value),
        ['install', 'quit', 'all'],
      );
    });
  });

  it('S14: "Show all options" opens the full menu, whose first row is never a second tool', async () => {
    await inCheckout(async (dir, deps) => {
      const rec = await journey(dir, ['install', 'go', ...INSTALL_MINI, 'all', 'quit'], { deps });
      assert.deepEqual(flow(rec).slice(-2), ['next', 'menu']);
      assert.notEqual(menus(rec)[1]?.options[0]?.value, 'init');
    });
  });

  it('N8: a beginner who only presses Enter goes from nothing to one installed rule, and quits', async () => {
    await inRoot(async root => {
      const dir = path.join(root, 'work');
      makeProject(dir);
      const driver = enterExcept([
        [SCOPE, 'pack'],
        [PACK_QUESTION, 'pack:mini'],
      ]);
      const rec = await journey(dir, driver, { deps: miniInstallDeps(root) });
      assert.deepEqual(flow(rec), [
        'menu',
        'init-tool',
        'next',
        'scope',
        'pack',
        'proceed',
        'next',
      ]);
      assert.equal(fs.existsSync(path.join(dir, MINI_RULE)), true);
      assert.equal(nexts(rec)[0]?.options[0]?.value, 'install');
      assert.equal(nexts(rec)[1]?.options[0]?.value, 'quit');
    });
  });

  it('W5: backing out of the install wizard returns to the full menu, never to "What next?"', async () => {
    await inRoot(async root => {
      const dir = path.join(root, 'work');
      makeProject(dir, ['claude']);
      const rec = await journey(dir, ['install', CANCEL, 'quit'], { deps: miniInstallDeps(root) });
      assert.deepEqual(flow(rec), ['menu', 'scope', 'menu']);
      assert.ok(rec.logs.some(l => /^warn: /.test(l)));
    });
  });

  it('W6: going ahead in one risky folder does not carry over to the next one', async () => {
    await inRoot(async root => {
      const a = path.join(root, 'a');
      const b = path.join(root, 'b');
      makeCheckout(a);
      makeCheckout(b);
      const answers = ['install', 'go', CANCEL, 'change-folder', b, FOLDER_CHOICE.use];
      const rec = await journey(a, [...answers, 'install', 'back', 'quit'], {
        deps: miniInstallDeps(root),
      });
      assert.equal(asked(rec, GUARD).length, 2);
    });
  });

  it('W7: an install that leaves a file missing gets the full menu with Restore on top', async () => {
    await inRoot(async root => {
      const dir = path.join(root, 'work');
      makeProject(dir, ['claude']);
      const deps = defaultHomeDeps(() => {});
      const install = async (at: string): Promise<void> => {
        await runAdd(
          ['rule:shared/git'],
          addOpts(at, { target: 'claude', yes: true, deps: false }),
        );
        fs.rmSync(path.join(at, MINI_RULE));
      };
      const rec = await journey(dir, ['install', 'quit'], {
        deps: { ...deps, handlers: { ...deps.handlers, install } },
      });
      assert.deepEqual(flow(rec), ['menu', 'menu']);
      assert.ok(marked(menus(rec)[1], /^Restore deleted files/));
    });
  });
});

describe('the same flows in a narrow or zoomed-in window', () => {
  const WINDOWS = [30, 40, 60, 100];

  for (const columns of WINDOWS) {
    it(`S11 asks the same questions and prints a one-line command in ${columns} columns`, async () => {
      await withTempDirAsync(async root => {
        const dir = path.join(root, 'work');
        makeCheckout(dir);
        fs.mkdirSync(path.join(dir, '.claude'));
        const answers = ['install', 'go', ...INSTALL_MINI, ENTER];
        const window = { columns, rows: 24 };
        const rec = await journey(dir, answers, { deps: miniInstallDeps(root), window });
        assert.deepEqual(flow(rec), SETUP_FLOW);
        assert.equal(rec.copied.length, 1);
        assert.match(rec.copied[0] ?? '', /^sigil add pack:mini .*--yes$/);
        assert.doesNotMatch(rec.copied[0] ?? '', /[\n│]/);
      }, 'sigil-narrow-');
    });
  }

  it('N8 gets a beginner from nothing to one installed rule in a 30-column window', async () => {
    await inRoot(async root => {
      const dir = path.join(root, 'work');
      makeProject(dir);
      const driver = enterExcept([
        [/^What would you like to i/, 'pack'],
        [/^Which pack/, 'pack:mini'],
      ]);
      const window = { columns: 30, rows: 14 };
      const rec = await journey(dir, driver, { deps: miniInstallDeps(root), window });
      assert.equal(fs.existsSync(path.join(dir, MINI_RULE)), true);
      assert.equal(nexts(rec)[1]?.options[0]?.value, 'quit');
    });
  });
});
