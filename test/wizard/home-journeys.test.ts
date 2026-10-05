/**
 * End-to-end journeys through the home menu with the real handlers: what a beginner who presses
 * Enter sees, what an experienced user shortcuts, and what happens when someone changes their mind.
 * Each journey asserts the exact list of questions shown, the files on disk and the folder shown
 * afterwards, so a repeated question, a dead end or a stray write fails here.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runAdd } from '../../dist-cli/commands/add';
import type { AddOpts } from '../../dist-cli/commands/add';
import { runInit } from '../../dist-cli/commands/init';
import { defaultHomeDeps } from '../../dist-cli/wizard/home-actions';
import { FOLDER_CHOICE } from '../../dist-cli/wizard/folder-list';
import { createRecorder, ENTER, mockClack } from '../helpers/clack-mock';
import type { MockDriver } from '../helpers/clack-mock';
import { fakeTTY } from '../helpers/tty';
import { withTempDirAsync } from '../helpers/temp-dir';
import {
  CANCEL,
  CATALOG_DIR,
  GUARD,
  PACKS_FILE,
  PICKER,
  SCOPE,
  TOOL_QUESTION,
  asked,
  enterExcept,
  flow,
  isMenu,
  journey,
  makeCheckout,
  makeProject,
  menus,
  nexts,
  shownFolder,
  snapshot,
} from '../helpers/home-flow';
import { getAllTargets } from '../../dist-cli/targets/index';

/** The home menu's Set up label once `setUp` tools are set up (src/wizard/home-menu.ts). */
function setUpLabelAfter(setUp: readonly string[]): string {
  const left = getAllTargets().filter(t => !setUp.includes(t.name));
  return left.length === 1 ? `Also set up for ${left[0]!.displayName}` : 'Set up another AI tool';
}

/** A temp root holding the folders of one scenario, so a picker can only wander inside it. */
async function inRoot(fn: (root: string) => Promise<void>): Promise<void> {
  await withTempDirAsync(fn, 'sigil-journey-');
}

const labels = (p: { options: Array<{ label: string }> } | undefined): string[] =>
  (p?.options ?? []).map(o => o.label);

const marked = (p: { options: Array<{ label: string }> } | undefined, what: RegExp): boolean =>
  labels(p).some(l => what.test(l) && /\(recommended\)/.test(l));

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

describe('beginner journeys (Enter, or the recommended entry, every time)', () => {
  it('N1: an empty project gets set up, then installed into, without a question asked twice', async () => {
    await inRoot(async root => {
      const dir = path.join(root, 'work');
      makeProject(dir);
      const rec = await journey(dir, enterExcept([[SCOPE, CANCEL]], 2));
      assert.deepEqual(flow(rec), ['menu', 'init-tool', 'next', 'scope', 'menu']);
      assert.match(labels(menus(rec)[0])[0] ?? '', /^Set up this project \(recommended\)/);
      assert.equal(labels(nexts(rec)[0])[0], 'Install artifacts');
      assert.match(labels(menus(rec)[1])[0] ?? '', /^Install artifacts \(recommended\)/);
      assert.ok(rec.logs.some(l => /Installing for Claude Code/.test(l)));
      assert.equal(fs.existsSync(path.join(dir, '.claude/skills')), true);
    });
  });

  it('N2: a project set up for one tool goes straight to "what to install"', async () => {
    await inRoot(async root => {
      const dir = path.join(root, 'work');
      makeProject(dir, ['claude']);
      const rec = await journey(dir, enterExcept([[SCOPE, CANCEL]], 1));
      assert.deepEqual(flow(rec), ['menu', 'scope', 'menu']);
      assert.equal(asked(rec, TOOL_QUESTION).length, 0);
    });
  });

  it('N3: from a catalog checkout, Enter on the recommendation opens a picker that is not on the checkout', async () => {
    await inRoot(async root => {
      const dir = path.join(root, 'work');
      makeCheckout(dir);
      const before = snapshot(dir);
      const rec = await journey(dir, enterExcept([[PICKER, FOLDER_CHOICE.back]], 1));
      assert.equal(menus(rec)[0]?.options[0]?.value, 'change-folder');
      const [picker] = asked(rec, PICKER);
      assert.equal(picker?.initialValue, undefined);
      assert.equal(picker?.options.find(o => o.value === dir)?.hint, 'the folder you are leaving');
      assert.deepEqual(snapshot(dir), before);
    });
  });

  it('N4: installing from a catalog checkout defaults to picking another folder, and writes nothing', async () => {
    await inRoot(async root => {
      const dir = path.join(root, 'work');
      makeCheckout(dir);
      const before = snapshot(dir);
      const rec = await journey(dir, ['install', ENTER, FOLDER_CHOICE.back, 'quit']);
      assert.deepEqual(flow(rec), ['menu', 'guard', 'picker', 'menu']);
      assert.equal(asked(rec, GUARD)[0]?.message, 'Where should sigil install?');
      const [guard] = asked(rec, GUARD);
      assert.deepEqual(
        guard?.options.map(o => o.value),
        ['move', 'go', 'back'],
      );
      assert.equal(guard?.initialValue, 'move');
      assert.ok(rec.logs.some(l => /^warn: This is a sigil catalog checkout/.test(l)));
      assert.deepEqual(snapshot(dir), before);
    });
  });

  it('N5: the home folder gets the same way out, with its own reason', async () => {
    await inRoot(async root => {
      const dir = path.join(root, 'home');
      makeProject(dir);
      const before = snapshot(dir);
      const rec = await journey(dir, ['install', ENTER, FOLDER_CHOICE.back, 'quit'], {
        homeDir: dir,
      });
      assert.equal(asked(rec, GUARD).length, 1);
      assert.ok(rec.logs.some(l => /^warn: This is your home folder/.test(l)));
      assert.deepEqual(snapshot(dir), before);
    });
  });

  it('N6: Ctrl+C at any one prompt goes back a level and writes nothing', async () => {
    const starts: Array<[string, (dir: string) => void, boolean]> = [
      ['a set-up project', dir => makeProject(dir, ['claude']), false],
      ['a catalog checkout', makeCheckout, true],
    ];
    for (const [name, make, risky] of starts) {
      for (let k = 0; k < 8; k += 1) {
        await inRoot(async root => {
          const dir = path.join(root, 'work');
          make(dir);
          const before = snapshot(dir);
          await journey(dir, cancelAt(k));
          if (risky) assert.deepEqual(snapshot(dir), before, `${name}, cancel at prompt ${k}`);
        });
      }
    }
  });

  it('N7: a recommendation that cannot fix anything stops being recommended and says so once', async () => {
    await inRoot(async root => {
      const dir = path.join(root, 'work');
      makeProject(dir, ['claude']);
      await runAdd(['rule:shared/git'], addOpts(dir, { target: 'claude', yes: true, deps: false }));
      fs.rmSync(path.join(dir, '.claude/rules/shared-git.md'));
      const deps = defaultHomeDeps(() => {});
      const stuck = { ...deps, handlers: { ...deps.handlers, restore: async () => {} } };
      const rec = await journey(dir, [ENTER, 'quit'], { deps: stuck });
      assert.ok(marked(menus(rec)[0], /^Restore deleted files/));
      assert.equal(marked(menus(rec)[1], /^Restore deleted files/), false);
      const notices = rec.logs.filter(l => /Nothing changed after "Restore deleted files"/.test(l));
      assert.equal(notices.length, 1);
    });
  });
});

/** Presses Enter, except for a Ctrl+C at prompt number `k`; afterwards it only backs out. */
function cancelAt(k: number): MockDriver {
  let n = 0;
  let cancelled = false;
  return prompt => {
    const index = n++;
    if (index === k) {
      cancelled = true;
      return CANCEL;
    }
    const wrapUp = cancelled || index >= 14; // a cap, so an Enter-only flow cannot run forever
    if (isMenu(prompt)) return wrapUp ? 'quit' : ENTER;
    return wrapUp ? CANCEL : ENTER;
  };
}

describe('experienced user journeys (knows the shortcuts)', () => {
  it('S1: sigil add --target copilot does not ask which tool', async () => {
    await withTempDirAsync(async dir => {
      makeProject(dir, ['claude']);
      const rec = createRecorder();
      const restoreTTY = fakeTTY();
      const restore = mockClack([CANCEL], rec);
      try {
        const result = await runAdd([], addOpts(dir, { target: 'copilot' }));
        assert.equal(result, 'cancelled');
      } finally {
        restore();
        restoreTTY();
      }
      assert.deepEqual(flow(rec), ['scope']);
      assert.ok(rec.logs.some(l => /Installing for GitHub Copilot \(--target\)/.test(l)));
    });
  });

  it('S2: an unknown --target fails before any question, like the scripted path', async () => {
    await withTempDirAsync(async dir => {
      const rec = createRecorder();
      const restoreTTY = fakeTTY();
      const restore = mockClack([], rec);
      try {
        await assert.rejects(runAdd([], addOpts(dir, { target: 'nope' })), /Unknown target 'nope'/);
      } finally {
        restore();
        restoreTTY();
      }
      assert.equal(rec.prompts.length, 0);
    });
  });

  it('S3: after adding Copilot from the menu, install asks which of the set-up tools', async () => {
    await inRoot(async root => {
      const dir = path.join(root, 'work');
      makeProject(dir, ['claude']);
      // With more than one tool left, Set up asks which one (init-tool) before setting it up.
      const rec = await journey(dir, ['init', 'copilot', 'install', CANCEL, 'quit']);
      assert.deepEqual(flow(rec), ['menu', 'init-tool', 'next', 'tool', 'menu']);
      const [question] = asked(rec, TOOL_QUESTION);
      assert.match(question?.message ?? '', /set up here: Claude Code, GitHub Copilot/);
    });
  });

  it('S4: with both tools set up, the choice made in the question carries on into the install', async () => {
    await inRoot(async root => {
      const dir = path.join(root, 'work');
      makeProject(dir, ['claude', 'copilot']);
      const rec = await journey(dir, ['install', 'copilot', CANCEL, 'quit']);
      const [question] = asked(rec, TOOL_QUESTION);
      assert.deepEqual(
        question?.options.map(o => o.value),
        getAllTargets().map(t => t.name),
      );
      assert.equal(question?.initialValue, 'claude');
      assert.equal(asked(rec, SCOPE).length, 1);
    });
  });

  it('S5: going ahead in a catalog checkout is remembered: no more change-folder nagging', async () => {
    await inRoot(async root => {
      const dir = path.join(root, 'work');
      makeCheckout(dir);
      fs.mkdirSync(path.join(dir, '.claude'));
      const rec = await journey(dir, ['install', 'go', CANCEL, 'quit']);
      assert.deepEqual(flow(rec), ['menu', 'guard', 'scope', 'menu']);
      assert.equal(marked(menus(rec)[1], /^Work in a different folder/), false);
    });
  });

  it('S6: picking another folder from the warning installs there, with no trip back to the menu', async () => {
    await inRoot(async root => {
      const work = path.join(root, 'work');
      const other = path.join(root, 'other');
      makeCheckout(work);
      makeProject(other, ['claude']);
      const before = snapshot(work);
      const rec = await journey(work, ['install', ENTER, other, FOLDER_CHOICE.use, CANCEL, 'quit']);
      assert.deepEqual(flow(rec), ['menu', 'guard', 'picker', 'picker', 'scope', 'menu']);
      assert.equal(path.resolve(shownFolder(rec) ?? ''), other);
      assert.match(labels(menus(rec)[1])[0] ?? '', /^Install artifacts \(recommended\)/);
      assert.deepEqual(snapshot(work), before);
    });
  });

  it('S7: choosing the same risky folder again is refused and asks again', async () => {
    await inRoot(async root => {
      const work = path.join(root, 'work');
      makeCheckout(work);
      const before = snapshot(work);
      const rec = await journey(work, ['install', ENTER, work, FOLDER_CHOICE.use, 'back', 'quit']);
      assert.equal(asked(rec, GUARD).length, 2);
      assert.ok(rec.logs.some(l => /^info: That is the same folder/.test(l)));
      assert.deepEqual(snapshot(work), before);
    });
  });

  it('S8: Back on the first install question returns to the menu instead of repeating it', async () => {
    await inRoot(async root => {
      const dir = path.join(root, 'work');
      makeProject(dir, ['claude']);
      const rec = await journey(dir, ['install', '__back__', 'quit']);
      assert.deepEqual(flow(rec), ['menu', 'scope', 'menu']);
      assert.equal(asked(rec, SCOPE)[0]?.options[0]?.label, '← Back to the menu');
    });
  });

  it('S9: outside a terminal the scripted commands behave as before', async () => {
    await withTempDirAsync(async dir => {
      await assert.rejects(runInit({ projectDir: dir }), /Missing --target/);
      await assert.rejects(runAdd([], addOpts(dir)), /No selectors provided/);
    });
  });

  it('S10: a damaged install record offers only repair, then install once it is fixed', async () => {
    await inRoot(async root => {
      const dir = path.join(root, 'work');
      makeProject(dir, ['claude']);
      fs.mkdirSync(path.join(dir, '.sigil'));
      fs.writeFileSync(path.join(dir, '.sigil/manifest.json'), '{ not json');
      const rec = await journey(dir, enterExcept([], 1));
      const first = menus(rec)[0];
      assert.equal(first?.options[0]?.value, 'repair');
      assert.equal(
        first?.options.some(o => o.value === 'install'),
        false,
      );
      assert.match(labels(menus(rec)[1])[0] ?? '', /^Install artifacts \(recommended\)/);
      assert.ok(
        fs.readdirSync(path.join(dir, '.sigil')).some(f => f.startsWith('manifest.damaged-')),
      );
    });
  });
});

describe('indecisive user journeys (changes their mind)', () => {
  it('W1: backing out of the warning and of the picker leaves everything as it was', async () => {
    await inRoot(async root => {
      const dir = path.join(root, 'work');
      makeCheckout(dir);
      const before = snapshot(dir);
      const rec = await journey(dir, [
        'install',
        'back',
        'change-folder',
        FOLDER_CHOICE.back,
        'install',
        'back',
        'quit',
      ]);
      assert.equal(asked(rec, GUARD).length, 2);
      assert.equal(asked(rec, PICKER).length, 1);
      assert.deepEqual(snapshot(dir), before);
    });
  });

  it('W2: cancelling the tool question changes nothing and is not counted as "ran without effect"', async () => {
    await inRoot(async root => {
      const dir = path.join(root, 'work');
      makeProject(dir);
      const rec = await journey(dir, ['init', CANCEL, 'quit']);
      assert.deepEqual(flow(rec), ['menu', 'init-tool', 'menu']);
      assert.equal(labels(menus(rec)[1])[0], labels(menus(rec)[0])[0]);
      assert.equal(
        rec.logs.some(l => /Nothing changed after/.test(l)),
        false,
      );
      assert.deepEqual(snapshot(dir), ['package.json']);
    });
  });

  it('W3: after setting up Claude Code, the menu moves on to install and offers the other tool', async () => {
    await inRoot(async root => {
      const dir = path.join(root, 'work');
      makeProject(dir);
      const rec = await journey(dir, ['init', 'claude', 'all', 'quit']);
      const second = menus(rec)[1];
      assert.match(labels(second)[0] ?? '', /^Install artifacts \(recommended\)/);
      assert.ok(labels(second).includes(setUpLabelAfter(['claude'])), labels(second).join(' | '));
      const header = rec.notes.filter(n => n.title === 'This folder')[1]?.body ?? '';
      assert.match(header, /Set up for:\s+Claude Code/);
    });
  });

  it('W4: leaving a folder and coming back brings its recommendation back', async () => {
    await inRoot(async root => {
      const a = path.join(root, 'a');
      const b = path.join(root, 'b');
      makeCheckout(a);
      makeProject(b);
      const rec = await journey(a, [
        'install',
        'go',
        CANCEL,
        'change-folder',
        b,
        FOLDER_CHOICE.use,
        'change-folder',
        a,
        FOLDER_CHOICE.use,
        'quit',
      ]);
      const all = menus(rec);
      assert.equal(marked(all[1], /^Work in a different folder/), false);
      assert.equal(path.resolve(shownFolder({ ...rec, notes: rec.notes.slice(0, -1) }) ?? ''), b);
      assert.ok(marked(all[3], /^Work in a different folder/));
    });
  });
});
