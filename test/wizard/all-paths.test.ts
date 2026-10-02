/**
 * Every interactive path, at every window size. Each scenario runs a real command or the real home
 * menu with long artifact ids, long paths and a long list, in windows from phone-sized to wide, and
 * checks that everything the person saw fits (`assertFits`), that a command to repeat is one pasteable
 * line, and that the questions asked are the same at every size (a narrow window never changes what
 * is asked, only how it is drawn).
 *
 * A scan keeps the table honest: every source file that imports the prompt layer must be named by a
 * scenario or by an exemption with a reason, so a new interactive path fails here until it is covered.
 * If you add a prompt to a new file, add a scenario (or an exemption) below.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runAdd } from '../../dist-cli/commands/add';
import type { AddOpts } from '../../dist-cli/commands/add';
import { runInit } from '../../dist-cli/commands/init';
import { runPrune } from '../../dist-cli/commands/prune';
import { runRepair } from '../../dist-cli/commands/repair-manifest';
import { runUninstall } from '../../dist-cli/commands/uninstall';
import { runUpdate } from '../../dist-cli/commands/update';
import { loadManifest, saveManifest, sha256 } from '../../dist-cli/manifest';
import type { ManifestEntry } from '../../dist-cli/manifest/types';
import { ENTER } from '../helpers/clack-mock';
import type { MockDriver, PromptRecord, Recorder } from '../helpers/clack-mock';
import { withTempDirAsync } from '../helpers/temp-dir';
import { stripAnsi } from '../helpers/ansi';
import type { WindowSize } from '../helpers/window';
import {
  CANCEL,
  CATALOG_DIR,
  PACKS_FILE,
  assertFits,
  inTerminal,
  isMenu,
  journey,
  makeProject,
  startsLike,
} from '../helpers/home-flow';

/** Runs `fn` in a fresh temp folder and returns what it returns. */
async function inTemp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  let result: T | undefined;
  await withTempDirAsync(async dir => {
    result = await fn(dir);
  }, 'sigil-paths-');
  return result as T;
}

/** From a phone-sized terminal to a wide one, short and tall: what zooming in and out produces. */
const WINDOWS: WindowSize[] = [
  { columns: 30, rows: 14 },
  { columns: 40, rows: 24 },
  { columns: 60, rows: 24 },
  { columns: 100, rows: 30 },
  { columns: 230, rows: 50 },
];

const INERT_COMMAND = /^(sigil|npm run \S+ --)( [A-Za-z0-9:/_.,@=-]+)*$/;
const MANY = 22;

/** An installed rule with a deliberately long id, recorded in the manifest with its file on disk. */
function entry(dir: string, id: string, file: string): ManifestEntry {
  const content = `# ${id}\n`;
  fs.mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), content);
  return {
    id,
    kind: 'rule',
    target: 'claude',
    sigilVersion: '0.0.0',
    files: [{ path: file, sha256: sha256(content) }],
    dependentOf: [],
    installedAt: '2026-01-01T00:00:00.000Z',
  } as ManifestEntry;
}

/** A project with many long-named installs (none are in the catalog, so prune has work too). */
function crowdedProject(dir: string): string[] {
  makeProject(dir, ['claude']);
  const ids = Array.from(
    { length: MANY },
    (_, i) => `typescript/ts-a-rather-long-artifact-name-${i}`,
  );
  const entries = ids.map((id, i) => entry(dir, id, `.claude/rules/long-${i}.md`));
  saveManifest(dir, { manifestVersion: 2, entries });
  return ids;
}

const addOpts = (dir: string, extra: Partial<AddOpts> = {}): AddOpts => ({
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
});

/** Answers every kind of prompt the way a cooperative person would, and gives up if it never ends. */
function cooperative(
  overrides: (p: PromptRecord) => ReturnType<MockDriver> | undefined = () => undefined,
): MockDriver {
  let asked = 0;
  return prompt => {
    asked += 1;
    if (asked > 80) return isMenu(prompt) ? 'quit' : CANCEL;
    const special = overrides(prompt);
    if (special !== undefined) return special;
    if (prompt.kind === 'multiselect') return prompt.options.map(o => o.value);
    if (prompt.kind === 'confirm') return true;
    return ENTER;
  };
}

/** What was asked, independent of how it was worded: the same at every window size. */
const valueOf = (value: string): string => (path.isAbsolute(value) ? '<folder>' : value);
const shape = (rec: Recorder): string =>
  rec.prompts.map(p => `${p.kind}[${p.options.map(o => valueOf(o.value)).join(',')}]`).join(' > ');

interface Scenario {
  name: string;
  /** Source files (relative to `src/`) whose prompts this scenario draws. */
  covers: string[];
  run: (window: WindowSize) => Promise<Recorder>;
  /** Windows to run in; the slow scenarios use a spread of three instead of all five. */
  windows?: WindowSize[];
  /** Commands the scenario is expected to print for the user to repeat. */
  repeats?: number;
}

const miniPacks = (root: string): string => {
  const file = path.join(root, 'mini-packs.yaml');
  fs.writeFileSync(
    file,
    'packs:\n  - name: mini\n    displayName: Mini\n    description: One rule.\n    artifacts:\n      - shared/git\n',
  );
  return file;
};

const SCENARIOS: Scenario[] = [
  {
    name: 'uninstall, picking from a long list, with an edited file',
    covers: [
      'commands/uninstall-confirm.ts',
      'wizard/installed-picker.ts',
      'commands/repair-manifest.ts',
    ],
    repeats: 1,
    run: window =>
      inTemp(async dir => {
        crowdedProject(dir);
        fs.writeFileSync(path.join(dir, '.claude/rules/long-0.md'), 'my own edit\n');
        const options = {
          projectDir: dir,
          target: 'claude',
          yes: false,
          force: false,
          dryRun: false,
        };
        return inTerminal(window, cooperative(), () => runUninstall([], options));
      }),
  },
  {
    name: 'update, with every artifact out of date',
    covers: ['commands/update-guided.ts'],
    run: window =>
      inTemp(async dir => {
        makeProject(dir, ['claude']);
        await runAdd(
          ['rule:shared/git', 'rule:shared/clean-code'],
          addOpts(dir, { target: 'claude', yes: true }),
        );
        const manifest = loadManifest(dir);
        for (const e of manifest.entries) {
          for (const file of e.files) {
            fs.writeFileSync(path.join(dir, file.path), 'old\n');
            file.sha256 = sha256('old\n');
          }
        }
        saveManifest(dir, manifest);
        const options = {
          projectDir: dir,
          target: 'claude',
          catalogDir: CATALOG_DIR,
          packs: PACKS_FILE,
          force: false,
          dryRun: false,
          yes: false,
        };
        return inTerminal(window, cooperative(), () => runUpdate([], options));
      }),
  },
  {
    name: 'prune, with leftovers',
    covers: ['commands/prune-guided.ts', 'commands/prune-apply.ts'],
    run: window =>
      inTemp(async dir => {
        crowdedProject(dir);
        const options = {
          projectDir: dir,
          target: 'claude',
          catalogDir: CATALOG_DIR,
          packs: PACKS_FILE,
          apply: false,
          yes: false,
          force: false,
          json: false,
        };
        return inTerminal(window, cooperative(), () => runPrune(options));
      }),
  },
  {
    name: 'set up a project',
    covers: ['commands/init-guided.ts'],
    repeats: 1,
    run: window =>
      inTemp(async dir => {
        makeProject(dir);
        return inTerminal(window, cooperative(), () => runInit({ projectDir: dir }));
      }),
  },
  {
    name: 'repair a damaged install record',
    covers: ['commands/repair-manifest.ts'],
    run: window =>
      inTemp(async dir => {
        makeProject(dir, ['claude']);
        fs.mkdirSync(path.join(dir, '.sigil'));
        fs.writeFileSync(path.join(dir, '.sigil/manifest.json'), '{ not json');
        return inTerminal(window, cooperative(), () => runRepair(dir));
      }),
  },
  {
    name: 'the install wizard, through a pack',
    covers: [
      'wizard/add.ts',
      'wizard/command-strings.ts',
      'wizard/steps/add/scope.ts',
      'wizard/steps/add/pack.ts',
      'wizard/steps/add/proceed.ts',
      'wizard/steps/add/plan-box.ts',
      'wizard/steps/add/target.ts',
      'wizard/steps/add/prompt-helpers.ts',
    ],
    repeats: 1,
    run: window =>
      inTemp(async root => {
        const dir = path.join(root, 'work');
        makeProject(dir, ['claude']);
        const packs = miniPacks(root);
        const driver = cooperative(p => {
          if (startsLike(p.message, 'What would you like to install')) return 'pack';
          if (startsLike(p.message, 'Which pack')) return 'pack:mini';
          return undefined;
        });
        return inTerminal(window, driver, () =>
          runAdd([], addOpts(dir, { packs, interactive: true })),
        );
      }),
  },
  {
    name: 'the home menu: status, remove, clean up, update, browse, search, change folder',
    windows: [WINDOWS[0] as WindowSize, WINDOWS[2] as WindowSize, WINDOWS[4] as WindowSize],
    covers: [
      'wizard/home.ts',
      'wizard/home-browse.ts',
      'wizard/home-target.ts',
      'wizard/folder-picker.ts',
    ],
    run: window =>
      inTemp(async root => {
        // A folder of its own, so the folder picker lists only it and not other tests' temp folders.
        const dir = path.join(root, 'work');
        crowdedProject(dir);
        const script = [
          'status',
          'uninstall',
          'prune',
          'update',
          'browse',
          'search',
          'change-folder',
        ];
        const driver = cooperative(p => {
          if (isMenu(p)) return script.shift() ?? 'quit';
          if (p.kind === 'multiselect') return p.options.slice(0, 2).map(o => o.value);
          if (p.kind === 'text') return 'ts';
          if (startsLike(p.message, 'Pick your project folder')) return '::back';
          if (p.kind === 'confirm' && startsLike(p.message, 'Remove the')) return false;
          return undefined;
        });
        const rec = await journey(dir, driver, { window });
        return rec;
      }),
  },
  {
    name: 'the home menu: the risky-folder question',
    covers: ['wizard/folder-guard.ts'],
    run: window =>
      inTemp(async root => {
        const dir = path.join(root, 'work');
        fs.mkdirSync(path.join(dir, 'catalog'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'packs.yaml'), 'packs: []\n');
        const script = ['install', 'init', 'quit'];
        const driver = cooperative(p => {
          if (isMenu(p)) return script.shift() ?? 'quit';
          if (startsLike(p.message, 'Where should sigil')) return 'move';
          if (startsLike(p.message, 'Pick your project folder')) return '::back';
          return undefined;
        });
        return journey(dir, driver, { window });
      }),
  },
];

/** Files that draw prompts but are covered by shape rather than by their own scenario, with why. */
const EXEMPT: Record<string, string> = {
  'commands/delete.ts':
    'author-only; one confirm and one text, on the prompt layer proven by prompts-fit and prompt-views tests',
  'commands/move.ts': 'author-only; same as delete',
  'commands/release.ts': 'author-only; one confirm per step, on the same prompt layer',
  'wizard/edit.ts':
    'author-only; text prompts, flow covered by edit.test.ts, widths by the text-window property tests',
  'wizard/steps/new/fields-confirm.ts':
    'author-only; text and confirm prompts, flow covered by the new-wizard tests',
  'wizard/steps/new/kind.ts': 'author-only; one select',
  'wizard/steps/new/language.ts': 'author-only; one select',
  'wizard/steps/new/platforms.ts': 'author-only; one multiselect',
  'wizard/steps/add/browse-kind.ts': 'one select; flow covered by add.test.ts',
  'wizard/steps/add/config-scope.ts': 'one select and notes; flow covered by add.test.ts',
  'wizard/steps/add/cross-kind-picker.ts':
    'select plus the install picker (picker-render property tests)',
  'wizard/steps/add/deps.ts': 'one confirm and a note; flow covered by add.test.ts',
  'wizard/steps/add/kind-picker.ts':
    'select plus the install picker (picker-render property tests)',
  'wizard/steps/add/language.ts': 'one select; flow covered by add.test.ts',
  'wizard/steps/add/overwrite.ts': 'one confirm and a note; flow covered by add.test.ts',
  'wizard/steps/add/pick.ts': 'wraps the install picker (picker-render property tests)',
};

describe('every interactive path at every window size', () => {
  for (const scenario of SCENARIOS) {
    it(`should fit, and ask the same questions, in every window: ${scenario.name}`, async () => {
      const shapes = new Set<string>();
      for (const window of scenario.windows ?? WINDOWS) {
        const rec = await scenario.run(window);
        assert.ok(rec.prompts.length > 0, `${window.columns} columns: nothing was asked`);
        // The home menu keeps its console output in the gutter and so is checked in full; a command run on
        // its own prints plain lines, which the terminal soft-wraps.
        assertFits(rec, window.columns, { console: scenario.name.startsWith('the home menu') });
        for (const line of rec.copied) {
          assert.match(stripAnsi(line), INERT_COMMAND, `${window.columns} columns: ${line}`);
        }
        if (scenario.repeats !== undefined) assert.equal(rec.copied.length, scenario.repeats);
        shapes.add(shape(rec));
      }
      assert.equal(
        shapes.size,
        1,
        `the questions changed with the window:\n${[...shapes].join('\n')}`,
      );
    });
  }
});

describe('the table of interactive paths', () => {
  const SRC = path.resolve(__dirname, '../../src');
  const PROMPTS_IMPORT = /from\s*'(\.\.?\/)+(wizard\/)?prompts'/;

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) return sourceFiles(full);
      return item.name.endsWith('.ts') ? [full] : [];
    });
  }

  it('should name every file that draws a prompt, in a scenario or an exemption', () => {
    const named = new Set([...SCENARIOS.flatMap(s => s.covers), ...Object.keys(EXEMPT)]);
    const drawing = sourceFiles(SRC)
      .map(file => path.relative(SRC, file).split(path.sep).join('/'))
      .filter(rel => PROMPTS_IMPORT.test(fs.readFileSync(path.join(SRC, rel), 'utf8')));
    assert.deepEqual(
      drawing.filter(rel => !named.has(rel)),
      [],
      'add a scenario (or an exemption with a reason) for each of these files',
    );
  });

  it('should not name a file that no longer exists or no longer draws a prompt', () => {
    const named = [...SCENARIOS.flatMap(s => s.covers), ...Object.keys(EXEMPT)];
    const stale = named.filter(rel => {
      const file = path.join(SRC, rel);
      return !fs.existsSync(file) || !PROMPTS_IMPORT.test(fs.readFileSync(file, 'utf8'));
    });
    assert.deepEqual(stale, []);
  });

  it('should keep every exemption reasoned', () => {
    for (const [file, reason] of Object.entries(EXEMPT)) {
      assert.ok(reason.length > 10, `${file} needs a real reason`);
    }
  });
});
