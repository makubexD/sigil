/**
 * `sigil add` and install variables: a `--var` value satisfies a declared name, a missing one
 * fails before anything is written, an id whose flag changes the recorded value is installed
 * again, and the install writes and records the value. The catalog is a temp fixture passed as
 * `--catalog-dir`, the way `test/commands/` installs a non-bundled catalog. Some "installed with
 * contoso" states are written by hand, as the fragment plus the manifest entry that recorded it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { runAdd } from '../../dist-cli/commands/add';
import { runUninstall } from '../../dist-cli/commands/uninstall';
import type { AddOpts } from '../../dist-cli/commands/add';
import { buildAddPlan } from '../../dist-cli/commands/add/plan';
import { SigilError } from '../../dist-cli/errors';
import { loadAndValidate } from '../../dist-cli/cli-helpers';
import { resolveCatalog } from '../../dist-cli/resolve';
import { getTarget } from '../../dist-cli/targets';
import { scaffoldConfigOps } from '../../dist-cli/config-ops';
import { canonicalize } from '../../dist-cli/config-merge';
import { loadManifest, MANIFEST_VERSION, saveManifest, sha256 } from '../../dist-cli/manifest';
import type { Manifest, ManifestEntry } from '../../dist-cli/manifest/types';
import type { ConfigMergeOp } from '../../dist-cli/types';
import { withTempDirAsync } from '../helpers/temp-dir';

const ID = 'shared/vars-fixture';
const PLAIN_ID = 'shared/plain-fixture';
const MCP_FILE = '.mcp.json';
/** The config file each target writes an MCP server into at project scope. */
const TARGET_CONFIG_FILES: Record<string, string> = {
  claude: MCP_FILE,
  copilot: MCP_FILE,
  cursor: '.cursor/mcp.json',
  codex: '.codex/config.toml',
  antigravity: '.agents/mcp_config.json',
  opencode: '.opencode/opencode.json',
};
const CLI = path.resolve(__dirname, '../../dist-cli/cli.js');
const HOME_VAR = process.platform === 'win32' ? 'USERPROFILE' : 'HOME';

/** The fixture catalog: one `mcp` artifact declaring A, one with no variables. */
const CATALOG_SOURCES: Record<string, string> = {
  'vars-fixture.mcp.md': [
    '---',
    `id: ${ID}`,
    'kind: mcp',
    'title: Vars fixture',
    'description: A fixture MCP server with one install variable.',
    'vars:',
    '  A:',
    '    title: First value',
    '    description: The first install value',
    'server:',
    '  command: npx',
    '  args:',
    "    - '-y'",
    "    - '@azure-devops/mcp@2.10.0'",
    "    - '{sigil:var:A}'",
    'tags: [test, fixture]',
    '---',
    '',
    'A fixture MCP server.',
    '',
  ].join('\n'),
  'plain-fixture.mcp.md': [
    '---',
    `id: ${PLAIN_ID}`,
    'kind: mcp',
    'title: Plain fixture',
    'description: A fixture MCP server with no install variables.',
    'server:',
    '  command: npx',
    '  args:',
    "    - '-y'",
    "    - '@azure-devops/mcp@2.10.0'",
    'tags: [test, fixture]',
    '---',
    '',
    'A fixture MCP server with no variables.',
    '',
  ].join('\n'),
};

interface Fixture {
  project: string;
  home: string;
  catalogDir: string;
  packs: string;
}

/** A project, a home and a catalog holding the two fixture MCP artifacts. */
function makeFixture(root: string): Fixture {
  const project = path.join(root, 'project');
  const home = path.join(root, 'home');
  const catalogDir = path.join(root, 'catalog');
  fs.mkdirSync(project);
  fs.mkdirSync(home);
  fs.mkdirSync(path.join(catalogDir, 'shared', 'mcps'), { recursive: true });
  for (const [name, source] of Object.entries(CATALOG_SOURCES)) {
    fs.writeFileSync(path.join(catalogDir, 'shared', 'mcps', name), source);
  }
  const packs = path.join(root, 'packs.yaml');
  fs.writeFileSync(packs, 'packs: []\n');
  return { project, home, catalogDir, packs };
}

function addOpts(fixture: Fixture, extra: Partial<AddOpts> = {}): AddOpts {
  return {
    projectDir: fixture.project,
    target: 'claude',
    catalogDir: fixture.catalogDir,
    packs: fixture.packs,
    deps: false,
    dryRun: false,
    interactive: false,
    yes: true,
    overwrite: false,
    settingsLocal: false,
    ...extra,
  };
}

/** Every config op the current code would write for the fixture artifact with contoso. */
async function contosoOps(fixture: Fixture): Promise<ConfigMergeOp[]> {
  const { catalog } = await loadAndValidate(fixture.catalogDir, fixture.packs);
  return scaffoldConfigOps(getTarget('claude'), ID, resolveCatalog(catalog), {
    projectDir: fixture.project,
    scope: 'project',
    vars: { A: 'contoso' },
  });
}

/** The manifest entry a prior `add --var A=contoso` would have recorded. */
function entryFromOps(ops: readonly ConfigMergeOp[]): ManifestEntry {
  return {
    id: ID,
    kind: 'mcp',
    target: 'claude',
    sigilVersion: '0.1.0',
    files: [],
    configFiles: ops.map(op => ({
      file: op.file,
      ...(op.root === undefined ? {} : { root: op.root }),
      fragment: op.fragment,
      strategy: op.strategy,
      fragmentSha256: sha256(canonicalize(op.fragment)),
    })),
    dependentOf: [],
    installedAt: '2026-10-01T00:00:00.000Z',
    vars: { A: 'contoso' },
  };
}

/** Writes the `.mcp.json` fragment and the manifest entry a contoso install left behind. */
async function installWithContoso(fixture: Fixture): Promise<void> {
  const ops = await contosoOps(fixture);
  const manifest: Manifest = { manifestVersion: MANIFEST_VERSION, entries: [entryFromOps(ops)] };
  saveManifest(fixture.project, manifest);
  for (const op of ops) {
    const full = path.join(fixture.project, op.file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, JSON.stringify(op.fragment, null, 2) + '\n');
  }
}

/** The manifest entry `id` has for `target`, if any. */
function entryFor(fixture: Fixture, target: string, id = ID): ManifestEntry | undefined {
  return loadManifest(fixture.project).entries.find(e => e.id === id && e.target === target);
}

/** Runs the built CLI against the fixture project and catalog. */
function sigil(
  fixture: Fixture,
  args: readonly string[],
): { status: number | null; output: string } {
  const result = spawnSync(
    process.execPath,
    [
      CLI,
      ...args,
      '--target',
      'claude',
      '--project-dir',
      fixture.project,
      '--catalog-dir',
      fixture.catalogDir,
      '--packs',
      fixture.packs,
    ],
    {
      cwd: fixture.project,
      encoding: 'utf8',
      env: { ...process.env, [HOME_VAR]: fixture.home },
      input: '',
      windowsHide: true,
    },
  );
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

describe('sigil add with install variables', () => {
  it('fails with the --var hint and writes nothing when --yes has no value', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);

      await assert.rejects(
        runAdd([`mcp:${ID}`], addOpts(fixture)),
        (err: unknown) =>
          err instanceof SigilError && err.hint?.includes('--var A=<value>') === true,
      );
      assert.equal(fs.existsSync(path.join(fixture.project, MCP_FILE)), false);
      assert.equal(fs.existsSync(path.join(fixture.project, '.sigil', 'manifest.json')), false);
    });
  });

  it('skips a server a bulk selector swept in and installs the rest', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);

      await runAdd(['kind:mcp'], addOpts(fixture));

      assert.equal(entryFor(fixture, 'claude'), undefined);
      assert.ok(entryFor(fixture, 'claude', PLAIN_ID), 'the server with no vars still installs');
    });
  });

  it('installs a bulk-selected server when the flag gives its value', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);

      await runAdd(['kind:mcp'], addOpts(fixture, { var: ['A=contoso'] }));

      assert.deepEqual(entryFor(fixture, 'claude')?.vars, { A: 'contoso' });
    });
  });

  it('previews a dry run with the flag and never prompts', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);

      const plan = await buildAddPlan(
        [`mcp:${ID}`],
        addOpts(fixture, { dryRun: true, var: ['A=contoso'] }),
      );
      assert.deepEqual(plan?.vars, { A: 'contoso' });

      const run = sigil(fixture, ['add', `mcp:${ID}`, '--var', 'A=contoso', '--dry-run']);
      assert.equal(run.status, 0, run.output);
      assert.match(run.output, /Dry run/);
      assert.equal(fs.existsSync(path.join(fixture.project, MCP_FILE)), false);
      assert.equal(fs.existsSync(path.join(fixture.project, '.sigil', 'manifest.json')), false);
    });
  });

  it('reports an id installed with contoso as already up to date without a flag', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);
      await installWithContoso(fixture);

      const lines: string[] = [];
      const plan = await (async () => {
        const original = console.log;
        console.log = (...args: unknown[]) => void lines.push(args.join(' '));
        try {
          return await buildAddPlan([`mcp:${ID}`], addOpts(fixture));
        } finally {
          console.log = original;
        }
      })();

      assert.ok(plan);
      assert.deepEqual(plan.upToDateIds, [ID]);
      assert.deepEqual(plan.configIds, []);
      assert.deepEqual(plan.vars, {});
      assert.match(lines.join('\n'), /already up to date/);
    });
  });

  it('keeps an id whose flag value differs from the recorded one in configIds', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);
      await installWithContoso(fixture);

      const plan = await buildAddPlan([`mcp:${ID}`], addOpts(fixture, { var: ['A=fabrikam'] }));

      assert.ok(plan);
      assert.deepEqual(plan.upToDateIds, []);
      assert.deepEqual(plan.configIds, [ID]);
      assert.deepEqual(plan.vars, { A: 'fabrikam' });
    });
  });

  it('accepts the recorded value as a flag on an up-to-date id', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);
      await installWithContoso(fixture);

      const plan = await buildAddPlan([`mcp:${ID}`], addOpts(fixture, { var: ['A=contoso'] }));

      assert.ok(plan);
      assert.deepEqual(plan.upToDateIds, [ID]);
      assert.deepEqual(plan.configIds, []);
      assert.deepEqual(plan.vars, {});
    });
  });

  it('exits 1 naming a typo flag', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);

      const run = sigil(fixture, ['add', `mcp:${ID}`, '--var', 'TYPO=x', '--yes']);

      assert.equal(run.status, 1, run.output);
      assert.match(run.output, /TYPO/);
    });
  });

  it('plans as today when the catalog declares no variables', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);

      const plan = await buildAddPlan([`mcp:${PLAIN_ID}`], addOpts(fixture));

      assert.ok(plan);
      assert.deepEqual(plan.vars, {});
      assert.deepEqual(plan.configIds, [PLAIN_ID]);
    });
  });

  for (const target of Object.keys(TARGET_CONFIG_FILES)) {
    it(`writes contoso and records it for ${target}`, async () => {
      await withTempDirAsync(async root => {
        const fixture = makeFixture(root);

        await runAdd([`mcp:${ID}`], addOpts(fixture, { target, var: ['A=contoso'] }));

        const file = path.join(fixture.project, TARGET_CONFIG_FILES[target]!);
        const text = fs.readFileSync(file, 'utf8');
        assert.match(text, /contoso/);
        assert.doesNotMatch(text, /\{sigil:/);
        assert.deepEqual(entryFor(fixture, target)?.vars, { A: 'contoso' });
      });
    });
  }

  it('records no vars key on an artifact that declares none', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);

      await runAdd([`mcp:${ID}`, `mcp:${PLAIN_ID}`], addOpts(fixture, { var: ['A=contoso'] }));

      const plain = entryFor(fixture, 'claude', PLAIN_ID);
      assert.ok(plain);
      assert.equal(Object.hasOwn(plain, 'vars'), false);
    });
  });

  it('replaces the recorded value and keeps one server entry', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);
      const file = path.join(fixture.project, MCP_FILE);

      await runAdd([`mcp:${ID}`], addOpts(fixture, { var: ['A=contoso'] }));
      await runAdd([`mcp:${ID}`], addOpts(fixture, { var: ['A=fabrikam'] }));

      const text = fs.readFileSync(file, 'utf8');
      assert.match(text, /fabrikam/);
      assert.doesNotMatch(text, /contoso/);
      const servers = (JSON.parse(text) as { mcpServers: Record<string, unknown> }).mcpServers;
      assert.equal(Object.keys(servers).length, 1);
      assert.deepEqual(entryFor(fixture, 'claude')?.vars, { A: 'fabrikam' });
    });
  });

  it('reuses the value another target recorded without a prompt', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);

      await runAdd([`mcp:${ID}`], addOpts(fixture, { var: ['A=contoso'] }));
      await runAdd([`mcp:${ID}`], addOpts(fixture, { target: 'copilot' }));

      const text = fs.readFileSync(path.join(fixture.project, MCP_FILE), 'utf8');
      assert.match(text, /contoso/);
      assert.deepEqual(entryFor(fixture, 'copilot')?.vars, { A: 'contoso' });
    });
  });

  it('previews a dry run merge with a placeholder and writes nothing', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);

      const run = sigil(fixture, ['add', `mcp:${ID}`, '--dry-run']);

      assert.equal(run.status, 0, run.output);
      assert.match(run.output, /Config merges that would be applied/);
      assert.match(run.output, /config merge — mcp/);
      assert.equal(fs.existsSync(path.join(fixture.project, MCP_FILE)), false);
      assert.equal(fs.existsSync(path.join(fixture.project, '.sigil', 'manifest.json')), false);
    });
  });

  it('removes the fragment and the recorded vars on uninstall', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);
      const file = path.join(fixture.project, MCP_FILE);

      await runAdd([`mcp:${ID}`], addOpts(fixture, { var: ['A=contoso'] }));
      await runUninstall([ID], {
        projectDir: fixture.project,
        target: 'claude',
        yes: true,
        force: false,
        dryRun: false,
      });

      assert.equal(entryFor(fixture, 'claude'), undefined);
      const remains = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      assert.doesNotMatch(remains, /contoso|vars-fixture/);
    });
  });
});
