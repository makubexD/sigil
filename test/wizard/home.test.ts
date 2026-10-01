/**
 * The home menu is what bare `sigil` opens in a terminal. Its content depends only on the state of
 * the folder (`ProjectContext`), so the menu and the header are pure; the loop is driven with
 * injected handlers so nothing real is installed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildMenu, describeContext } from '../../dist-cli/wizard/home-menu';
import { runHome } from '../../dist-cli/wizard/home';
import { FOLDER_CHOICE } from '../../dist-cli/wizard/folder-list';
import { defaultHomeDeps } from '../../dist-cli/wizard/home-actions';
import type { HomeActionId } from '../../dist-cli/wizard/home-menu';
import type { ProjectContext } from '../../dist-cli/project-context';
import { SigilError } from '../../dist-cli/errors';
import { mockClack } from '../helpers/clack-mock';
import { fakeTTY } from '../helpers/tty';
import type { MockAnswer } from '../helpers/clack-mock';
import { withTempDirAsync } from '../helpers/temp-dir';

function context(overrides: Partial<ProjectContext> = {}): ProjectContext {
  return {
    projectDir: '/work/app',
    detectedTargets: ['claude'],
    manifestPresent: true,
    installed: 3,
    installedByTarget: { claude: 3 },
    health: { 'up-to-date': 3, outdated: 0, drifted: 0, orphaned: 0, missing: 0 },
    isCatalogCheckout: false,
    looksLikeProject: true,
    isHomeDir: false,
    isFilesystemRoot: false,
    ...overrides,
  };
}

const values = (ctx: ProjectContext): string[] => buildMenu(ctx).map(item => item.value);

describe('buildMenu', () => {
  it('should offer set-up first in an unconfigured folder and hide what needs an install', () => {
    const items = values(context({ detectedTargets: [], manifestPresent: false, installed: 0 }));
    assert.equal(items[0], 'init');
    for (const hidden of ['update', 'uninstall', 'status', 'prune', 'restore']) {
      assert.ok(!items.includes(hidden as HomeActionId), `${hidden} should be hidden`);
    }
    assert.ok(items.includes('install'));
  });

  it('should recommend installing when the project is set up but empty', () => {
    const [first] = buildMenu(context({ manifestPresent: false, installed: 0 }));
    assert.equal(first?.value, 'install');
    assert.equal(first?.recommended, true);
    assert.match(first?.label ?? '', /recommended/i);
  });

  it('should put the restore action first when files were deleted', () => {
    const health = { 'up-to-date': 2, outdated: 0, drifted: 0, orphaned: 0, missing: 1 };
    const items = buildMenu(context({ health }));
    assert.equal(items[0]?.value, 'restore');
    assert.match(items[0]?.hint ?? '', /deleted/);
  });

  it('should recommend nothing when the project is installed and healthy', () => {
    assert.equal(
      buildMenu(context()).some(item => item.recommended),
      false,
    );
  });

  it('should show author actions only inside a catalog checkout', () => {
    const outside = values(context());
    const inside = values(context({ isCatalogCheckout: true }));
    for (const author of ['new', 'edit', 'validate']) {
      assert.ok(!outside.includes(author as HomeActionId), `${author} outside a checkout`);
      assert.ok(inside.includes(author as HomeActionId), `${author} inside a checkout`);
    }
  });

  it('should recommend changing folder first inside a catalog checkout', () => {
    assert.equal(values(context({ isCatalogCheckout: true }))[0], 'change-folder');
  });

  it('should offer to repair a damaged install record and not offer to install', () => {
    const damaged = context({ manifestError: 'bad json', installed: 0, installedByTarget: {} });
    const items = values(damaged);
    assert.equal(items[0], 'repair');
    assert.ok(!items.includes('install'), 'install stays hidden until the record is repaired');
  });

  it('should keep "Set up this project" available until every tool is set up', () => {
    assert.ok(values(context({ detectedTargets: ['claude'] })).includes('init'));
    assert.ok(!values(context({ detectedTargets: ['claude', 'copilot'] })).includes('init'));
  });

  it('should say what the recommended entry does as well as why it is first', () => {
    const [first] = buildMenu(context({ manifestPresent: false, installed: 0 }));
    assert.match(first?.hint ?? '', /Add skills, agents, rules/);
    assert.match(first?.hint ?? '', /Nothing is installed here yet/);
  });

  it('should always end with help and quit, and always offer browse and search', () => {
    const items = values(context());
    assert.deepEqual(items.slice(-2), ['help', 'quit']);
    assert.ok(items.includes('browse') && items.includes('search') && items.includes('install'));
  });
});

describe('describeContext', () => {
  it('should say the folder is not set up yet', () => {
    const lines = describeContext(
      context({ detectedTargets: [], manifestPresent: false, installed: 0 }),
    ).join('\n');
    assert.match(lines, /\/work\/app/);
    assert.match(lines, /not set up/i);
  });

  it('should name the targets and summarise health', () => {
    const health = { 'up-to-date': 1, outdated: 0, drifted: 1, orphaned: 0, missing: 1 };
    const lines = describeContext(context({ health, detectedTargets: ['claude', 'copilot'] })).join(
      '\n',
    );
    assert.match(lines, /Claude Code/);
    assert.match(lines, /Copilot/);
    assert.match(lines, /3 installed/);
    assert.match(lines, /1 missing/);
    assert.match(lines, /1 edited/);
  });

  it('should say everything is healthy when it is', () => {
    assert.match(describeContext(context()).join('\n'), /all healthy/i);
  });

  it('should surface a damaged install record and say how to fix it', () => {
    const lines = describeContext(context({ manifestError: 'bad json', installed: 0 })).join('\n');
    assert.match(lines, /damaged/i);
    assert.match(lines, /Repair/);
  });

  it('should show what is installed for each tool when more than one has installs', () => {
    const lines = describeContext(
      context({
        installed: 5,
        installedByTarget: { claude: 3, copilot: 2 },
        detectedTargets: ['claude', 'copilot'],
      }),
    ).join('\n');
    assert.match(lines, /3 Claude Code/);
    assert.match(lines, /2 GitHub Copilot/);
  });
});

describe('runHome', () => {
  type Calls = Array<[HomeActionId, string]>;

  function handlers(calls: Calls, throwFor?: HomeActionId) {
    const ids: HomeActionId[] = ['install', 'update', 'uninstall', 'status', 'prune', 'init'];
    return Object.fromEntries(
      ids.map(id => [
        id,
        async (dir: string) => {
          calls.push([id, dir]);
          if (id === throwFor) throw new SigilError('Boom', { hint: 'try again' });
        },
      ]),
    );
  }

  async function run(dir: string, answers: MockAnswer[], calls: Calls, throwFor?: HomeActionId) {
    const restore = mockClack(answers);
    try {
      await runHome(dir, { handlers: handlers(calls, throwFor), homeDir: '/nowhere/home' });
    } finally {
      restore();
    }
  }

  it('should run the chosen action against the current folder, then quit', async () => {
    await withTempDirAsync(async dir => {
      const calls: Calls = [];
      await run(dir, ['install', 'quit'], calls);
      assert.deepEqual(calls, [['install', dir]]);
    });
  });

  it('should return to the menu after an action so several can run in one session', async () => {
    await withTempDirAsync(async dir => {
      const calls: Calls = [];
      await run(dir, ['init', 'install', 'quit'], calls);
      assert.deepEqual(
        calls.map(([id]) => id),
        ['init', 'install'],
      );
    });
  });

  it('should show an action error and return to the menu instead of exiting', async () => {
    await withTempDirAsync(async dir => {
      const calls: Calls = [];
      await run(dir, ['install', 'init', 'quit'], calls, 'install');
      assert.deepEqual(
        calls.map(([id]) => id),
        ['install', 'init'],
      );
    });
  });

  it('should explain what to try when a folder cannot be written to', async () => {
    await withTempDirAsync(async dir => {
      const infos: string[] = [];
      const restore = mockClack(['install', 'quit']);
      const clack = require('@clack/prompts') as { log: { info: (m: string) => void } };
      clack.log.info = (message: string) => void infos.push(message);
      const denied = Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
      try {
        await runHome(dir, {
          handlers: {
            install: async () => {
              throw denied;
            },
          },
          homeDir: '/nowhere/home',
        });
      } finally {
        restore();
      }
      assert.match(infos.join(' '), /Pick a different folder/);
    });
  });

  it('should exit quietly when the user cancels at the menu', async () => {
    await withTempDirAsync(async dir => {
      const calls: Calls = [];
      await run(dir, [Symbol('cancel')], calls);
      assert.deepEqual(calls, []);
    });
  });

  it('should switch folder and run later actions there', async () => {
    await withTempDirAsync(async dir => {
      const other = path.join(dir, 'other');
      fs.mkdirSync(other);
      const calls: Calls = [];
      await run(dir, ['change-folder', other, FOLDER_CHOICE.use, 'install', 'quit'], calls);
      assert.deepEqual(calls, [['install', other]]);
    });
  });

  it('should ask before installing into the home folder, and not install on "no"', async () => {
    await withTempDirAsync(async dir => {
      const calls: Calls = [];
      const restore = mockClack(['install', false, 'quit']);
      try {
        await runHome(dir, { handlers: handlers(calls), homeDir: dir });
      } finally {
        restore();
      }
      assert.deepEqual(calls, []);
    });
  });

  it('should install into the home folder when the user confirms', async () => {
    await withTempDirAsync(async dir => {
      const calls: Calls = [];
      const restore = mockClack(['install', true, 'quit']);
      try {
        await runHome(dir, { handlers: handlers(calls), homeDir: dir });
      } finally {
        restore();
      }
      assert.deepEqual(calls, [['install', dir]]);
    });
  });

  it('should not ask about other actions in the home folder', async () => {
    await withTempDirAsync(async dir => {
      const calls: Calls = [];
      const restore = mockClack(['status', 'quit']);
      try {
        await runHome(dir, { handlers: handlers(calls), homeDir: dir });
      } finally {
        restore();
      }
      assert.deepEqual(calls, [['status', dir]]);
    });
  });

  it('should keep the current folder when the user backs out of the folder picker', async () => {
    await withTempDirAsync(async dir => {
      const calls: Calls = [];
      await run(dir, ['change-folder', FOLDER_CHOICE.back, 'install', 'quit'], calls);
      assert.deepEqual(calls, [['install', dir]]);
    });
  });
});

describe('default home handlers', () => {
  it('should have a handler for every menu entry the loop does not run itself', () => {
    const everything = buildMenu(
      context({
        isCatalogCheckout: true,
        health: { 'up-to-date': 0, outdated: 1, drifted: 1, orphaned: 1, missing: 1 },
      }),
    );
    const noInit = buildMenu(
      context({ detectedTargets: [], manifestPresent: false, installed: 0 }),
    );
    const damaged = buildMenu(context({ manifestError: 'bad json', installed: 0 }));
    const { handlers } = defaultHomeDeps(() => {});
    for (const { value } of [...everything, ...noInit, ...damaged]) {
      if (value === 'quit' || value === 'change-folder') continue;
      assert.equal(typeof handlers[value], 'function', `no handler for '${value}'`);
    }
  });
});

describe('home menu with the real handlers', () => {
  it('should set up an empty folder through the menu: init, then see install recommended', async () => {
    await withTempDirAsync(async dir => {
      const restoreTTY = fakeTTY();
      const restore = mockClack(['init', 'claude', 'quit']);
      try {
        await runHome(dir, { ...defaultHomeDeps(() => {}), homeDir: '/nowhere/home' });
      } finally {
        restore();
        restoreTTY();
      }
      assert.equal(fs.existsSync(path.join(dir, '.claude/skills')), true);
      assert.equal(fs.existsSync(path.join(dir, '.claude/rules')), true);
    });
  });
});
