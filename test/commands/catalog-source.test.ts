/**
 * `status`, `prune` and `update` against a catalog the manifest recorded
 * (docs/plan-manifest-catalog-source.md, step 4).
 *
 * A project that installs once from a team catalog (`--catalog-dir ../team-catalog`) must have
 * those commands judge the entry against that same catalog, with no flags, instead of reporting
 * it orphaned against the bundled one. These tests drive the command functions directly — as the
 * frozen-install and wizard tests do — so a `SigilError` can be asserted and `--json` output
 * captured without a subprocess.
 *
 * RED until `add` records the source and the commands group by it: every case that installs
 * `shared/team-only` still sees it orphaned against the bundled catalog.
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runAdd } from '../../dist-cli/commands/add';
import { runStatus } from '../../dist-cli/commands/status';
import { runPrune } from '../../dist-cli/commands/prune';
import { runUpdate } from '../../dist-cli/commands/update';
import { loadManifest } from '../../dist-cli/manifest';
import type { ManifestEntry } from '../../dist-cli/manifest/types';
import { SigilError } from '../../dist-cli/errors';
import { resolveDefault } from '../../dist-cli/cli-helpers';
import { makeTeamCatalog } from '../helpers/team-catalog';
import type { TeamCatalog } from '../helpers/team-catalog';

/** The catalog options commander fills in when no `--catalog-dir` / `--packs` is passed. */
const BUNDLED = {
  catalogDir: resolveDefault('catalog'),
  packs: resolveDefault('packs.yaml'),
};

const TEAM_RULE = 'shared/team-only';
const BUNDLED_RULE = 'shared/clean-code';
const TEAM_RULE_FILE = '.claude/rules/shared-team-only.md';
const MANIFEST_FILE = '.sigil/manifest.json';

/** Explicit catalog paths, in the shape the command option objects take. */
interface CatalogPaths {
  catalogDir: string;
  packs: string;
}

/** One row of `sigil status --json`. */
interface StatusRow {
  id: string;
  status: string;
}

/** The `sigil prune --json` report. */
interface PruneReport {
  applied: boolean;
  orphaned: { id: string }[];
  inlined: { id: string }[];
  inlinedUnconfirmed: { id: string }[];
  deprecated: { id: string }[];
}

const roots: string[] = [];

/** A fresh temp root, removed after the test whatever it does. */
function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-catalog-source-cmd-'));
  roots.push(root);
  return root;
}

/** Runs `fn` with `console.log` captured, returning everything it printed. */
async function captureText(fn: () => Promise<void>): Promise<string> {
  const original = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.join(' '));
  };
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return lines.join('\n');
}

/** Runs `fn` with `console.log` captured, parsing the printed text as JSON. */
async function captureJson<T>(fn: () => Promise<void>): Promise<T> {
  return JSON.parse(await captureText(fn)) as T;
}

/** Runs `fn` with no console output, for a call expected to throw. */
async function silently(fn: () => Promise<void>): Promise<void> {
  const original = console.log;
  console.log = () => {};
  try {
    await fn();
  } finally {
    console.log = original;
  }
}

/** Non-interactive `sigil add <selector> --target claude` from `catalog`. */
async function add(project: string, selector: string, catalog: CatalogPaths): Promise<void> {
  await runAdd([selector], {
    projectDir: project,
    catalogDir: catalog.catalogDir,
    packs: catalog.packs,
    target: 'claude',
    deps: true,
    dryRun: false,
    interactive: false,
    yes: true,
    overwrite: false,
    settingsLocal: false,
  });
}

/** A project folder under a temp root, with both catalog copies in place. */
function makeProject(root: string): string {
  const project = path.join(root, 'project');
  fs.mkdirSync(project);
  return project;
}

function installedIds(project: string): string[] {
  return loadManifest(project).entries.map(e => e.id);
}

/** The manifest entry for `id`; fails clearly when the install did not happen. */
function entryOf(project: string, id: string): ManifestEntry {
  const entry = loadManifest(project).entries.find(e => e.id === id);
  assert.ok(entry, `${id} is not installed`);
  return entry;
}

function orphanedIds(rows: StatusRow[]): string[] {
  return rows.filter(r => r.status === 'orphaned').map(r => r.id);
}

/** `sigil status --json --target claude` with `catalog`. */
async function statusJson(project: string, catalog: CatalogPaths): Promise<StatusRow[]> {
  return captureJson<StatusRow[]>(() =>
    runStatus({ projectDir: project, target: 'claude', ...catalog, json: true }),
  );
}

/** A temp root, a team catalog and a project with one entry from each catalog. */
async function installedFixture(): Promise<{
  root: string;
  project: string;
  team: TeamCatalog;
}> {
  const root = makeRoot();
  const team = makeTeamCatalog(root);
  const project = makeProject(root);
  await add(project, `rule:${TEAM_RULE}`, { catalogDir: team.dir, packs: team.packs });
  await add(project, `rule:${BUNDLED_RULE}`, BUNDLED);
  assert.deepEqual(installedIds(project).sort(), [BUNDLED_RULE, TEAM_RULE]);
  return { root, project, team };
}

describe('catalog source commands', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('add records the team catalog for an artifact installed from it', async () => {
    const root = makeRoot();
    const team = makeTeamCatalog(root);
    const project = makeProject(root);

    await add(project, `rule:${TEAM_RULE}`, { catalogDir: team.dir, packs: team.packs });

    assert.deepEqual(entryOf(project, TEAM_RULE).catalog, {
      dir: '../team-catalog',
      packs: '../team-catalog/packs.yaml',
    });
  });

  it('add records nothing for an artifact installed from the bundled catalog', async () => {
    const root = makeRoot();
    const project = makeProject(root);

    await add(project, `rule:${BUNDLED_RULE}`, BUNDLED);

    assert.equal(entryOf(project, BUNDLED_RULE).catalog, undefined);
  });

  it('status with no catalog flags judges each entry against its own catalog', async () => {
    const { project } = await installedFixture();

    const rows = await statusJson(project, BUNDLED);

    assert.deepEqual(orphanedIds(rows), []);
    assert.deepEqual(
      rows.map(r => r.id).sort(),
      [BUNDLED_RULE, TEAM_RULE],
      'both installed entries are reported',
    );
  });

  it('prune with no catalog flags finds nothing to remove', async () => {
    const { project } = await installedFixture();
    const teamFile = path.join(project, TEAM_RULE_FILE);
    const before = fs.readFileSync(teamFile, 'utf8');

    const preview = await captureJson<PruneReport>(() =>
      runPrune({
        projectDir: project,
        target: 'claude',
        ...BUNDLED,
        apply: false,
        yes: false,
        force: false,
        json: true,
      }),
    );
    assert.deepEqual(preview.orphaned, []);
    assert.deepEqual(preview.inlined, []);
    assert.deepEqual(preview.inlinedUnconfirmed, []);
    assert.deepEqual(preview.deprecated, []);

    const installed = installedIds(project).sort();
    const applied = await captureJson<PruneReport>(() =>
      runPrune({
        projectDir: project,
        target: 'claude',
        ...BUNDLED,
        apply: true,
        yes: true,
        force: false,
        json: true,
      }),
    );
    assert.equal(applied.applied, true);
    assert.deepEqual(installedIds(project).sort(), installed, 'prune --apply removes nothing');
    assert.equal(fs.readFileSync(teamFile, 'utf8'), before, 'the team file is untouched');
  });

  it('update with no catalog flags reports no orphan and leaves the team file alone', async () => {
    const { project } = await installedFixture();
    const teamFile = path.join(project, TEAM_RULE_FILE);
    const before = fs.readFileSync(teamFile, 'utf8');

    const out = await captureText(() =>
      runUpdate([], {
        projectDir: project,
        target: 'claude',
        ...BUNDLED,
        force: false,
        dryRun: false,
        yes: true,
      }),
    );

    assert.doesNotMatch(out, /no longer in the catalog/, 'the team entry is not orphaned');
    assert.equal(fs.readFileSync(teamFile, 'utf8'), before, 'the team file is unchanged');
  });

  it('status, prune and update throw when a recorded catalog is gone, writing nothing', async () => {
    const { root, project, team } = await installedFixture();
    const manifestPath = path.join(project, MANIFEST_FILE);
    const before = fs.readFileSync(manifestPath, 'utf8');
    fs.renameSync(team.dir, path.join(root, 'team-catalog-moved'));

    const commands: Array<[string, () => Promise<void>]> = [
      [
        'status',
        () => runStatus({ projectDir: project, target: 'claude', ...BUNDLED, json: true }),
      ],
      [
        'prune',
        () =>
          runPrune({
            projectDir: project,
            target: 'claude',
            ...BUNDLED,
            apply: false,
            yes: false,
            force: false,
            json: true,
          }),
      ],
      [
        'update',
        () =>
          runUpdate([], {
            projectDir: project,
            target: 'claude',
            ...BUNDLED,
            force: false,
            dryRun: false,
            yes: true,
          }),
      ],
    ];

    for (const [name, run] of commands) {
      await assert.rejects(silently(run), (err: unknown) => {
        assert.ok(err instanceof SigilError, `${name} throws SigilError`);
        assert.match(err.message, /not found/, `${name} names the missing catalog`);
        assert.match(err.hint ?? '', /--catalog-dir/, `${name} hint names the flag`);
        return true;
      });
      assert.equal(fs.readFileSync(manifestPath, 'utf8'), before, `${name} writes nothing`);
    }
  });

  it('status --catalog-dir <bundled> behaves as no flag', async () => {
    const { project } = await installedFixture();

    // Spelled differently from commander's default, so only a resolved comparison treats it as bundled.
    const rows = await statusJson(project, {
      catalogDir: `${BUNDLED.catalogDir}${path.sep}`,
      packs: BUNDLED.packs,
    });

    assert.deepEqual(orphanedIds(rows), [], 'the team entry is still judged against its catalog');
  });

  it('status --catalog-dir <team> judges every entry against the team catalog', async () => {
    const { project, team } = await installedFixture();

    const rows = await statusJson(project, { catalogDir: team.dir, packs: team.packs });

    assert.deepEqual(
      rows.map(r => r.id).sort(),
      [BUNDLED_RULE, TEAM_RULE],
      'both entries exist in the team catalog',
    );
    assert.deepEqual(orphanedIds(rows), []);
  });
});
