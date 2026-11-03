/**
 * `sigil status` names a config artifact its target would now refuse as installed, the way
 * `update` prints `kept as installed: <reason>`. A target refuses
 * a hook it cannot map; editing the catalog after install reproduces that on a real target.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runAdd } from '../../dist-cli/commands/add';
import type { AddOpts } from '../../dist-cli/commands/add';
import { runStatus } from '../../dist-cli/commands/status';
import { makeTeamCatalog } from '../helpers/team-catalog';
import type { TeamCatalog } from '../helpers/team-catalog';
import { withTempDirAsync } from '../helpers/temp-dir';

const HOOK = 'shared/protect-config';
const TARGET = 'antigravity';
const HOME_VAR = process.platform === 'win32' ? 'USERPROFILE' : 'HOME';
/** The catalog source of {@link HOOK}, relative to the catalog directory. */
const HOOK_SOURCE = 'shared/hooks/protect-config.hook.md';

/** The reason Antigravity refuses a matcher on a non-tool event. */
const KEPT_REASON = /Antigravity applies a matcher only to PreToolUse and PostToolUse/;

/** One row of `sigil status --json`. */
interface StatusRow {
  id: string;
  target: string;
  keptReason?: string;
}

interface Fixture {
  project: string;
  home: string;
  catalog: TeamCatalog;
}

/** A temp root's project dir, a separate temp home, and the team catalog. */
function makeFixture(root: string): Fixture {
  const project = path.join(root, 'project');
  const home = path.join(root, 'home');
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  return { project, home, catalog: makeTeamCatalog(root) };
}

/** Runs `fn` with the home directory redirected at `home`, restoring it afterwards. */
async function withHome<T>(home: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.env[HOME_VAR];
  process.env[HOME_VAR] = home;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env[HOME_VAR];
    else process.env[HOME_VAR] = previous;
  }
}

function addOpts(fixture: Fixture): AddOpts {
  return {
    projectDir: fixture.project,
    catalogDir: fixture.catalog.dir,
    packs: fixture.catalog.packs,
    target: TARGET,
    scope: 'project',
    deps: true,
    dryRun: false,
    interactive: false,
    yes: true,
    overwrite: false,
    settingsLocal: false,
  };
}

function statusOpts(fixture: Fixture, json: boolean) {
  return {
    projectDir: fixture.project,
    catalogDir: fixture.catalog.dir,
    packs: fixture.catalog.packs,
    target: TARGET,
    json,
  };
}

/** Runs `fn` with console output captured, returning every printed line. */
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

/** Installs {@link HOOK} for {@link TARGET}, then makes the catalog one Antigravity refuses. */
async function installThenRefuse(root: string): Promise<Fixture> {
  const fixture = makeFixture(root);
  await withHome(fixture.home, async () => {
    await runAdd([`hook:${HOOK}`], addOpts(fixture));
  });
  const source = path.join(fixture.catalog.dir, HOOK_SOURCE);
  const text = fs.readFileSync(source, 'utf8');
  // A matcher on a non-tool event: Antigravity cannot render it, and `update` keeps the entry.
  const edited = text.replace(/^event: before-tool$/m, 'event: stop');
  assert.notEqual(edited, text, 'the catalog hook event was rewritten');
  fs.writeFileSync(source, edited);
  return fixture;
}

/** The status row for the installed hook. */
function hookRow(rows: StatusRow[]): StatusRow {
  const row = rows.find(r => r.id === HOOK && r.target === TARGET);
  assert.ok(row, 'status lists the installed hook');
  return row;
}

describe('sigil status — a config entry its target refuses', () => {
  it('should print the reason under the entry and carry keptReason in --json', async () => {
    await withTempDirAsync(async root => {
      const fixture = await installThenRefuse(root);
      const output = await captureText(() => runStatus(statusOpts(fixture, false)));
      assert.match(output, /⚠ kept as installed: /);
      assert.match(output, KEPT_REASON);

      const rows = await captureJson<StatusRow[]>(() => runStatus(statusOpts(fixture, true)));
      const row = hookRow(rows);
      assert.match(row.keptReason ?? '', KEPT_REASON);
    });
  });

  it('should print nothing and carry no keptReason for an accepted hook', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);
      await withHome(fixture.home, async () => {
        await runAdd([`hook:${HOOK}`], addOpts(fixture));
      });

      const output = await captureText(() => runStatus(statusOpts(fixture, false)));
      assert.doesNotMatch(output, /kept as installed/);

      const rows = await captureJson<StatusRow[]>(() => runStatus(statusOpts(fixture, true)));
      assert.equal('keptReason' in hookRow(rows), false, 'no keptReason');
    });
  });
});
