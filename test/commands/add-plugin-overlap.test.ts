/**
 * `sigil add` and the plugin duplicate guard: an artifact an enabled marketplace plugin already
 * delivers is still installed, with one warning naming the plugin. Under `--complement` (here the
 * `complement` option) it is skipped instead, while anything the plugin does not hold — a rule a
 * skill `uses`, for instance — is still written.
 *
 * The plugin reader looks at `<home>/.claude/settings.json`; every test passes a temp home through
 * `AddOpts.homeDir`, so the real `~` is never read.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runAdd } from '../../dist-cli/commands/add';
import { buildAddPlan } from '../../dist-cli/commands/add/plan';
import { runStatus } from '../../dist-cli/commands/status';
import { runUpdate } from '../../dist-cli/commands/update';
import { loadManifest } from '../../dist-cli/manifest';
import { createRecorder, mockClack, ENTER } from '../helpers/clack-mock';
import type { MockAnswer } from '../helpers/clack-mock';
import { fakeTTY } from '../helpers/tty';
import { makeTempDir, withTempDirAsync } from '../helpers/temp-dir';
import type { AddOpts } from '../../dist-cli/commands/add';

const CATALOG = path.resolve(__dirname, '../../catalog');
const PACKS = path.resolve(__dirname, '../../packs.yaml');

/** The pack plugin the tests enable, and a skill it holds (its rule dependency it does not). */
const PACK = 'cli-builder';
const SKILL = 'skill:shared/cli';
const RULE_FILE = '.claude/rules/shared-cli-rules.md';

/** A starter plugin holds `ts-code-reviewer` but not `ts-sync-tests`, the skill that uses it. */
const STARTER = 'typescript-starter';
const USING_SKILL = 'skill:typescript/ts-sync-tests';
const HELD_AGENT_FILE = '.claude/agents/ts-code-reviewer.md';

/** The same shape for Python: the starter plugin holds `py-code-reviewer`, which `py-document` uses. */
const PYTHON_STARTER = 'python-starter';
const PYTHON_PICKS = ['skill:python/py-document', 'agent:python/py-security-auditor'];

/** Enables the `pack` plugin (default `PACK`) at user scope in `home`. */
function enablePack(home: string, pack = PACK): void {
  const dir = path.join(home, '.claude');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'settings.json'),
    JSON.stringify({ enabledPlugins: { [`${pack}@sigil`]: true } }, null, 2),
  );
}

/** Runs `sigil add` against a temp project and home, returning every clack log line. */
async function add(
  projectDir: string,
  homeDir: string,
  selector: string | readonly string[],
  extra: Partial<AddOpts> = {},
): Promise<string[]> {
  const recorder = createRecorder();
  const restore = mockClack([], recorder);
  const originalLog = console.log;
  console.log = () => {};
  try {
    await runAdd(typeof selector === 'string' ? [selector] : [...selector], {
      projectDir,
      catalogDir: CATALOG,
      packs: PACKS,
      target: 'claude',
      deps: false,
      dryRun: false,
      interactive: false,
      yes: true,
      overwrite: false,
      settingsLocal: false,
      homeDir,
      ...extra,
    });
  } finally {
    console.log = originalLog;
    restore();
  }
  return recorder.logs;
}

/** Runs `sigil add` with no selector in a fake TTY, driving the real wizard; returns its recorder. */
async function addViaWizard(
  projectDir: string,
  homeDir: string,
  answers: MockAnswer[],
): Promise<ReturnType<typeof createRecorder>> {
  const recorder = createRecorder();
  const restoreTTY = fakeTTY();
  const restore = mockClack(answers, recorder);
  const originalLog = console.log;
  console.log = () => {};
  try {
    await runAdd([], {
      projectDir,
      catalogDir: CATALOG,
      packs: PACKS,
      target: 'claude',
      deps: true,
      dryRun: false,
      interactive: true,
      yes: false,
      overwrite: false,
      settingsLocal: false,
      homeDir,
    });
  } finally {
    console.log = originalLog;
    restore();
    restoreTTY();
  }
  return recorder;
}

/** Runs `sigil update` against a temp project and home, with the add helper's mocks. */
async function update(projectDir: string, homeDir: string): Promise<void> {
  const restore = mockClack([], createRecorder());
  const originalLog = console.log;
  console.log = () => {};
  try {
    await runUpdate([], {
      projectDir,
      catalogDir: CATALOG,
      packs: PACKS,
      target: 'claude',
      force: false,
      dryRun: false,
      yes: true,
      homeDir,
    });
  } finally {
    console.log = originalLog;
    restore();
  }
}

/** The manifest's entry ids, sorted. */
function entryIds(projectDir: string): string[] {
  return loadManifest(projectDir)
    .entries.map(entry => entry.id)
    .sort();
}

/** Every file under `dir`, relative and slash-separated, sorted. */
function listFiles(dir: string): string[] {
  const files: string[] = [];
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(path.relative(dir, full).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return files.sort();
}

/** A fresh temp directory removed when the body returns. */
async function inTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = makeTempDir();
  try {
    await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const HEADER =
  /artifact\(s\) an enabled plugin already delivers \(installed anyway; --complement skips them\):/;

/** One row of `sigil status --json`. */
interface StatusRow {
  id: string;
  status: string;
}

/** Runs `fn` and returns everything it logged. */
async function captureText(fn: () => Promise<void>): Promise<string> {
  const original = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => lines.push(args.join(' '));
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return lines.join('\n');
}

/** Runs `fn` and parses its `--json` output. */
async function captureJson<T>(fn: () => Promise<void>): Promise<T> {
  return JSON.parse(await captureText(fn)) as T;
}

describe('sigil add — plugin duplicate guard', () => {
  it('should install the skill and warn when an enabled plugin also delivers it', async () => {
    await withTempDirAsync(async project => {
      await inTempDir(async home => {
        enablePack(home);

        const logs = await add(project, home, SKILL);
        const text = logs.join('\n');

        assert.ok(fs.existsSync(path.join(project, '.claude/skills/cli/SKILL.md')));
        assert.match(text, HEADER);
        assert.match(
          text,
          /shared\/cli is also delivered by plugin cli-builder@sigil \(enabled in ~\/\.claude\/settings\.json\)/,
        );
      });
    });
  });

  it('should leave the plugin advisory to the wizard plan box', async () => {
    await withTempDirAsync(async project => {
      await inTempDir(async home => {
        enablePack(home);

        const rec = await addViaWizard(project, home, ['pack', `pack:${PACK}`, ENTER, 'proceed']);
        const text = rec.logs.join('\n');

        assert.ok(fs.existsSync(path.join(project, '.claude/skills/cli/SKILL.md')));
        assert.doesNotMatch(text, HEADER);
        assert.ok(
          rec.notes.some(n => /an enabled plugin already delivers/.test(n.body)),
          'the wizard plan box showed the advisory',
        );
      });
    });
  });

  it('should print the plugin advisory once for a typed add', async () => {
    await withTempDirAsync(async project => {
      await inTempDir(async home => {
        enablePack(home);

        const text = (await add(project, home, SKILL)).join('\n');

        const count = [...text.matchAll(/an enabled plugin already delivers/g)].length;
        assert.equal(count, 1);
      });
    });
  });

  it('should skip the skill under complement and say which plugin delivers it', async () => {
    await withTempDirAsync(async project => {
      await inTempDir(async home => {
        enablePack(home);

        const logs = await add(project, home, SKILL, { complement: true });
        const text = logs.join('\n');

        assert.ok(!fs.existsSync(path.join(project, '.claude/skills/cli/SKILL.md')));
        assert.match(text, /delivered by plugin cli-builder@sigil \(~\/\.claude\/settings\.json\)/);
        assert.doesNotMatch(text, /installed anyway/);
      });
    });
  });

  it('should report a typed --complement on the plan', async () => {
    await withTempDirAsync(async project => {
      await inTempDir(async home => {
        enablePack(home);

        const restore = mockClack([], createRecorder());
        const originalLog = console.log;
        console.log = () => {};
        try {
          const plan = await buildAddPlan([SKILL], {
            projectDir: project,
            catalogDir: CATALOG,
            packs: PACKS,
            target: 'claude',
            deps: false,
            dryRun: true,
            interactive: false,
            yes: true,
            overwrite: false,
            settingsLocal: false,
            homeDir: home,
            complement: true,
          });

          assert.ok(plan);
          assert.equal(plan.effectiveComplement, true);
          assert.ok(!plan.wholeFileIds.includes('shared/cli'));
        } finally {
          console.log = originalLog;
          restore();
        }
      });
    });
  });

  it('should still write a rule the skipped skill uses', async () => {
    await withTempDirAsync(async project => {
      await inTempDir(async home => {
        enablePack(home);

        await add(project, home, SKILL, { complement: true, deps: true });

        assert.ok(fs.existsSync(path.join(project, RULE_FILE)));
        assert.ok(!fs.existsSync(path.join(project, '.claude/skills/cli/SKILL.md')));
      });
    });
  });

  it('should write the same files as without the flag when no plugin is enabled', async () => {
    await withTempDirAsync(async projectWithout => {
      await withTempDirAsync(async projectWith => {
        await inTempDir(async home => {
          await add(projectWithout, home, SKILL);
          await add(projectWith, home, SKILL, { complement: true });

          assert.deepEqual(listFiles(projectWith), listFiles(projectWithout));
        });
      });
    });
  });

  it('should say nothing for a target that reads no plugin state', async () => {
    await withTempDirAsync(async project => {
      await inTempDir(async home => {
        enablePack(home);

        const logs = await add(project, home, SKILL, { target: 'cursor' });

        assert.doesNotMatch(logs.join('\n'), HEADER);
      });
    });
  });

  it('should show the skip on a dry run and write nothing', async () => {
    await withTempDirAsync(async project => {
      await inTempDir(async home => {
        enablePack(home);

        const logs = await add(project, home, SKILL, { complement: true, dryRun: true });

        assert.match(
          logs.join('\n'),
          /delivered by plugin cli-builder@sigil \(~\/\.claude\/settings\.json\)/,
        );
        assert.deepEqual(listFiles(project), []);
      });
    });
  });

  it('should warn about a dependency an enabled plugin also delivers', async () => {
    await withTempDirAsync(async project => {
      await inTempDir(async home => {
        enablePack(home, STARTER);

        const logs = await add(project, home, USING_SKILL, { deps: true });

        assert.ok(fs.existsSync(path.join(project, HELD_AGENT_FILE)));
        assert.match(
          logs.join('\n'),
          /typescript\/ts-code-reviewer is also delivered by plugin typescript-starter@sigil/,
        );
      });
    });
  });

  it('should not write a dependency the plugin holds under complement', async () => {
    await withTempDirAsync(async project => {
      await inTempDir(async home => {
        enablePack(home, STARTER);

        const logs = await add(project, home, USING_SKILL, { deps: true, complement: true });

        assert.ok(fs.existsSync(path.join(project, '.claude/skills/ts-sync-tests/SKILL.md')));
        assert.ok(!fs.existsSync(path.join(project, HELD_AGENT_FILE)));
        assert.match(
          logs.join('\n'),
          /typescript\/ts-code-reviewer \(agent\): delivered by plugin typescript-starter@sigil/,
        );
      });
    });
  });

  it('should render with the set update uses when a plugin delivers a dependency', async () => {
    await withTempDirAsync(async project => {
      await inTempDir(async home => {
        enablePack(home, PYTHON_STARTER);

        await add(project, home, PYTHON_PICKS, { deps: true, complement: true });

        const rows = await captureJson<StatusRow[]>(() =>
          runStatus({
            projectDir: project,
            catalogDir: CATALOG,
            packs: PACKS,
            json: true,
            homeDir: home,
            target: 'claude',
          }),
        );
        assert.ok(rows.length > 0, 'status reports the installed entries');
        for (const row of rows) {
          assert.equal(row.status, 'up-to-date', `${row.id} reports ${row.status}`);
        }
      });
    });
  });

  it('should not report a plugin-delivered dependency as new', async () => {
    await withTempDirAsync(async project => {
      await inTempDir(async home => {
        enablePack(home, PYTHON_STARTER);

        await add(project, home, PYTHON_PICKS, { deps: true, complement: true });

        const statusOpts = {
          projectDir: project,
          catalogDir: CATALOG,
          packs: PACKS,
          homeDir: home,
          target: 'claude',
        };
        const rows = await captureJson<StatusRow[]>(() => runStatus({ ...statusOpts, json: true }));
        for (const row of rows) {
          assert.ok(!('newDependencies' in row), `${row.id} reports new dependencies`);
        }

        const text = await captureText(() => runStatus({ ...statusOpts, json: false }));
        assert.doesNotMatch(text, /update would also install/);
      });
    });
  });

  it('should not install a dependency an enabled plugin delivers on update', async () => {
    await withTempDirAsync(async project => {
      await inTempDir(async home => {
        enablePack(home, PYTHON_STARTER);
        await add(project, home, PYTHON_PICKS, { deps: true, complement: true });

        const filesBefore = listFiles(project);
        const idsBefore = entryIds(project);
        await update(project, home);

        assert.deepEqual(listFiles(project), filesBefore);
        assert.deepEqual(entryIds(project), idsBefore);
      });
    });
  });
});
