/**
 * `sigil status` and the plugin duplicate guard: an installed entry an enabled marketplace plugin
 * also delivers gets a note line and a `plugin` field on its `--json` row. With nothing enabled
 * the output is unchanged, and `status` never writes (the plan, decision 5).
 *
 * The plugin reader looks at `<home>/.claude/settings.json`; every test passes a temp home through
 * `StatusOptions.homeDir`, so the real `~` is never read.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runAdd } from '../../dist-cli/commands/add';
import { runStatus } from '../../dist-cli/commands/status';
import { MANIFEST_RELATIVE_PATH } from '../../dist-cli/manifest/types';
import { createRecorder, mockClack } from '../helpers/clack-mock';
import { withTempDirAsync } from '../helpers/temp-dir';
import type { StatusOptions } from '../../dist-cli/commands/status';

const CATALOG = path.resolve(__dirname, '../../catalog');
const PACKS = path.resolve(__dirname, '../../packs.yaml');

/** The pack plugin the tests enable, and the installed artifacts that are or are not in it. */
const PACK = 'cli-builder';
const SKILL_ID = 'shared/cli';
const SKILL = `skill:${SKILL_ID}`;
const RULE_ID = 'shared/clean-code';
const RULE = `rule:${RULE_ID}`;
const SOURCE = '~/.claude/settings.json';

/** One row of `sigil status --json`. */
interface StatusRow {
  id: string;
  target: string;
  plugin?: { name: string; marketplace: string; source: string };
}

/** Writes the settings that enable `plugin` at user scope in `home`. */
function enable(home: string, plugin: string): void {
  const dir = path.join(home, '.claude');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'settings.json'),
    JSON.stringify({ enabledPlugins: { [`${plugin}@sigil`]: true } }, null, 2),
  );
}

/** Runs `fn`, returning every `console.log` line joined by newlines. */
async function captureLogs(fn: () => Promise<void>): Promise<string> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => void lines.push(args.join(' '));
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return lines.join('\n');
}

/** Runs `sigil add <selector>` against a temp project and home, printing nothing. */
async function install(projectDir: string, homeDir: string, selector: string): Promise<void> {
  const recorder = createRecorder();
  const restore = mockClack([], recorder);
  const original = console.log;
  console.log = () => {};
  try {
    await runAdd([selector], {
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
    });
  } finally {
    console.log = original;
    restore();
  }
}

function statusOpts(projectDir: string, homeDir: string, json = false): StatusOptions {
  return { projectDir, catalogDir: CATALOG, packs: PACKS, target: 'claude', json, homeDir };
}

/** A temp project and a separate temp home, both removed when the body returns. */
async function withFixture(fn: (project: string, home: string) => Promise<void>): Promise<void> {
  await withTempDirAsync(async root => {
    const project = path.join(root, 'project');
    const home = path.join(root, 'home');
    fs.mkdirSync(project);
    fs.mkdirSync(home);
    await fn(project, home);
  });
}

describe('sigil status — plugin duplicate guard', () => {
  it('should note an installed skill that an enabled plugin also delivers', async () => {
    await withFixture(async (project, home) => {
      await install(project, home, SKILL);
      enable(home, PACK);

      const output = await captureLogs(() => runStatus(statusOpts(project, home)));
      const notes = output.split('\n').filter(line => line.includes('is also delivered by plugin'));

      assert.equal(notes.length, 1);
      assert.match(
        notes[0] ?? '',
        /^ {2}ℹ {2}shared\/cli is also delivered by plugin cli-builder@sigil \(enabled in ~\/\.claude\/settings\.json\) \(installed for claude\)$/,
      );
    });
  });

  it('should leave the output unchanged when no enabled plugin delivers the artifact', async () => {
    await withFixture(async (project, home) => {
      await install(project, home, SKILL);

      // The run before any plugin is enabled, then the same run with an unrelated plugin enabled.
      const before = await captureLogs(() => runStatus(statusOpts(project, home)));
      enable(home, 'deepseek-worker');
      const after = await captureLogs(() => runStatus(statusOpts(project, home)));

      assert.equal(after, before);
      assert.doesNotMatch(after, /is also delivered by plugin/);
    });
  });

  it('should report the plugin on the delivering JSON row and no key on the others', async () => {
    await withFixture(async (project, home) => {
      await install(project, home, SKILL);
      await install(project, home, RULE);
      enable(home, PACK);

      const output = await captureLogs(() => runStatus(statusOpts(project, home, true)));
      const rows = JSON.parse(output) as StatusRow[];
      const skill = rows.find(row => row.id === SKILL_ID);
      const rule = rows.find(row => row.id === RULE_ID);

      assert.deepEqual(skill?.plugin, { name: PACK, marketplace: 'sigil', source: SOURCE });
      assert.ok(rule, `${RULE_ID} is not installed`);
      assert.ok(!('plugin' in rule));
    });
  });

  it('should write nothing: the manifest and the settings file stay byte-identical', async () => {
    await withFixture(async (project, home) => {
      await install(project, home, SKILL);
      enable(home, PACK);

      const manifestFile = path.join(project, MANIFEST_RELATIVE_PATH);
      const settingsFile = path.join(home, '.claude', 'settings.json');
      const manifestBefore = fs.readFileSync(manifestFile);
      const settingsBefore = fs.readFileSync(settingsFile);

      await captureLogs(() => runStatus(statusOpts(project, home)));

      assert.ok(fs.readFileSync(manifestFile).equals(manifestBefore));
      assert.ok(fs.readFileSync(settingsFile).equals(settingsBefore));
    });
  });
});
