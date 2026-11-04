/**
 * `sigil update` and install variables: the recorded values supply the catalog's `{sigil:var:}`
 * tokens, a missing one keeps the entry as installed and points at `--var`, and a written entry
 * records only its artifact's declared names. The catalog is a temp fixture passed as
 * `--catalog-dir`, the way `test/commands/` installs a non-bundled catalog.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runUpdate } from '../../dist-cli/commands/update';
import type { UpdateOptions } from '../../dist-cli/commands/update';
import { loadAndValidate } from '../../dist-cli/cli-helpers';
import { canonicalize } from '../../dist-cli/config-merge';
import { entryKey, staleEntries } from '../../dist-cli/freshness';
import { MANIFEST_VERSION, loadManifest, saveManifest, sha256 } from '../../dist-cli/manifest';
import type { Manifest, ManifestEntry } from '../../dist-cli/manifest/types';
import { resolveCatalog } from '../../dist-cli/resolve';
import { getTarget } from '../../dist-cli/targets';
import { withTempDirAsync } from '../helpers/temp-dir';

const ID = 'shared/vars-fixture';
const SERVER = 'vars-fixture';
const MCP_FILE = '.mcp.json';
const OLD_PKG = '@azure-devops/mcp@2.9.0';
const NEW_PKG = '@azure-devops/mcp@2.10.0';

/** The fixture catalog: one `mcp` artifact declaring ADO_ORG, used in `args`. */
const CATALOG_SOURCE = [
  '---',
  `id: ${ID}`,
  'kind: mcp',
  'title: Vars fixture',
  'description: A fixture MCP server with one install variable.',
  'vars:',
  '  ADO_ORG:',
  '    title: Organization',
  '    description: The org in dev.azure.com/<org>',
  'server:',
  '  command: npx',
  '  args:',
  "    - '-y'",
  `    - '${NEW_PKG}'`,
  "    - '{sigil:var:ADO_ORG}'",
  '    - --authentication',
  '    - azcli',
  'tags: [test, fixture]',
  '---',
  '',
  'A fixture MCP server.',
  '',
].join('\n');

interface Fixture {
  project: string;
  catalog: { dir: string; packs: string };
}

/** A project dir plus a catalog holding only the vars fixture artifact. */
function makeFixture(root: string): Fixture {
  const project = path.join(root, 'project');
  fs.mkdirSync(project);
  const dir = path.join(root, 'catalog');
  fs.mkdirSync(path.join(dir, 'shared', 'mcps'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'shared', 'mcps', 'vars-fixture.mcp.md'), CATALOG_SOURCE);
  const packs = path.join(root, 'packs.yaml');
  fs.writeFileSync(packs, 'packs: []\n');
  return { project, catalog: { dir, packs } };
}

/** The catalog's current server, with a literal organization. */
function currentServer(org: string, pkg = NEW_PKG): Record<string, unknown> {
  return { command: 'npx', args: ['-y', pkg, org, '--authentication', 'azcli'] };
}

/** What the pre-vars catalog installed: an env reference and the PAT authentication. */
const PRE_VARS_SERVER = {
  command: 'npx',
  args: ['-y', NEW_PKG, '${ADO_ORG}', '--authentication', 'pat', '-d', 'core'],
  env: { ADO_MCP_PERSONAL_TOKEN: '${ADO_MCP_PERSONAL_TOKEN}' },
};

/** A manifest entry whose recorded fragment holds `server`. */
function makeEntry(server: Record<string, unknown>, vars?: Record<string, string>): ManifestEntry {
  const fragment = { mcpServers: { [SERVER]: server } };
  return {
    id: ID,
    kind: 'mcp',
    target: 'claude',
    sigilVersion: '0.1.0',
    files: [],
    configFiles: [
      {
        file: MCP_FILE,
        fragment,
        strategy: { mcpServers: 'object-spread' },
        fragmentSha256: sha256(canonicalize(fragment)),
      },
    ],
    dependentOf: [],
    installedAt: '2026-10-01T00:00:00.000Z',
    ...(vars ? { vars } : {}),
  };
}

/** An entry installed with `org`, its file matching what update will write. */
function installed(org: string, pkg = NEW_PKG, vars?: Record<string, string>): ManifestEntry {
  return makeEntry(currentServer(org, pkg), vars);
}

/** Writes the manifest and each recorded fragment's file into `project`. */
function writeProject(project: string, entry: ManifestEntry): void {
  const manifest: Manifest = { manifestVersion: MANIFEST_VERSION, entries: [entry] };
  saveManifest(project, manifest);
  for (const cf of entry.configFiles ?? []) {
    const full = path.join(project, cf.file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, JSON.stringify(cf.fragment, null, 2) + '\n');
  }
}

function readMcpFile(project: string): Record<string, unknown> {
  const parsed = JSON.parse(fs.readFileSync(path.join(project, MCP_FILE), 'utf8')) as {
    mcpServers: Record<string, Record<string, unknown>>;
  };
  return parsed.mcpServers[SERVER] as Record<string, unknown>;
}

function serverNames(project: string): string[] {
  const parsed = JSON.parse(fs.readFileSync(path.join(project, MCP_FILE), 'utf8')) as {
    mcpServers: Record<string, unknown>;
  };
  return Object.keys(parsed.mcpServers);
}

function argsOf(project: string): string[] {
  return readMcpFile(project).args as string[];
}

function updateOpts(fixture: Fixture, extra: Partial<UpdateOptions> = {}): UpdateOptions {
  return {
    projectDir: fixture.project,
    target: 'claude',
    catalogDir: fixture.catalog.dir,
    packs: fixture.catalog.packs,
    force: false,
    dryRun: false,
    yes: true,
    ...extra,
  };
}

/** Runs `fn` with console output captured (log, warn and error), returning every line. */
async function capture(fn: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const saved = { log: console.log, warn: console.warn, error: console.error };
  const push = (...args: unknown[]) => void lines.push(args.join(' '));
  console.log = push;
  console.warn = push;
  console.error = push;
  try {
    await fn();
  } finally {
    Object.assign(console, saved);
  }
  return lines;
}

describe('sigil update with install variables', () => {
  it('rewrites a changed catalog arg and keeps the recorded value', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);
      writeProject(fixture.project, installed('contoso', OLD_PKG, { ADO_ORG: 'contoso' }));

      await capture(() => runUpdate([], updateOpts(fixture)));

      const args = argsOf(fixture.project);
      assert.ok(args.includes(NEW_PKG), args.join(' '));
      assert.ok(args.includes('contoso'), args.join(' '));
      assert.equal(
        fs.readFileSync(path.join(fixture.project, MCP_FILE), 'utf8').includes('{sigil:'),
        false,
      );
      assert.deepEqual(loadManifest(fixture.project).entries[0]!.vars, { ADO_ORG: 'contoso' });
    });
  });

  it('writes nothing when the catalog render is unchanged', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);
      writeProject(fixture.project, installed('contoso', NEW_PKG, { ADO_ORG: 'contoso' }));
      const fileBefore = fs.readFileSync(path.join(fixture.project, MCP_FILE), 'utf8');

      const lines = await capture(() => runUpdate([], updateOpts(fixture)));

      assert.equal(fs.readFileSync(path.join(fixture.project, MCP_FILE), 'utf8'), fileBefore);
      assert.equal(
        lines.some(l => l.includes(`✓  ${ID}`)),
        false,
        lines.join('\n'),
      );
      assert.deepEqual(loadManifest(fixture.project).entries[0]!.vars, { ADO_ORG: 'contoso' });
    });
  });

  it('restores a fragment deleted by hand with the recorded value, without --force', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);
      const entry = installed('contoso', NEW_PKG, { ADO_ORG: 'contoso' });
      writeProject(fixture.project, entry);
      fs.writeFileSync(path.join(fixture.project, MCP_FILE), '{}\n');

      await capture(() => runUpdate([], updateOpts(fixture)));

      assert.ok(argsOf(fixture.project).includes('contoso'));
    });
  });

  it('keeps an entry recorded before vars as installed and names the --var flag', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);
      const entry = makeEntry(PRE_VARS_SERVER);
      writeProject(fixture.project, entry);
      const fileBefore = fs.readFileSync(path.join(fixture.project, MCP_FILE), 'utf8');
      const manifestBefore = fs.readFileSync(
        path.join(fixture.project, '.sigil', 'manifest.json'),
        'utf8',
      );

      const lines = await capture(() => runUpdate([], updateOpts(fixture)));

      const output = lines.join('\n');
      assert.match(output, /⊘/);
      assert.match(output, /kept as installed: needs ADO_ORG; re-run with --var ADO_ORG=<value>/);
      assert.equal(fs.readFileSync(path.join(fixture.project, MCP_FILE), 'utf8'), fileBefore);
      assert.equal(
        fs.readFileSync(path.join(fixture.project, '.sigil', 'manifest.json'), 'utf8'),
        manifestBefore,
      );
    });
  });

  it('reports the pre-vars entry as stale', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);
      const entry = makeEntry(PRE_VARS_SERVER);
      writeProject(fixture.project, entry);
      const { catalog } = await loadAndValidate(fixture.catalog.dir, fixture.catalog.packs);

      const fresh = await staleEntries(
        { manifestVersion: MANIFEST_VERSION, entries: [entry] },
        {
          resolved: resolveCatalog(catalog),
          projectDir: fixture.project,
          targetOf: () => getTarget('claude'),
        },
      );

      assert.ok(fresh.stale.has(entryKey(entry)), [...fresh.stale].join(', '));
    });
  });

  it('installs the value given by the vars option and records it', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);
      writeProject(fixture.project, makeEntry(PRE_VARS_SERVER));

      await capture(() => runUpdate([], updateOpts(fixture, { vars: { ADO_ORG: 'contoso' } })));

      const server = readMcpFile(fixture.project);
      assert.ok((server.args as string[]).includes('contoso'));
      assert.equal('env' in server, false);
      assert.deepEqual(loadManifest(fixture.project).entries[0]!.vars, { ADO_ORG: 'contoso' });
    });
  });

  it('replaces a recorded value instead of stacking a second server', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);
      writeProject(fixture.project, installed('contoso', NEW_PKG, { ADO_ORG: 'contoso' }));

      await capture(() => runUpdate([], updateOpts(fixture, { vars: { ADO_ORG: 'fabrikam' } })));

      const args = argsOf(fixture.project);
      assert.ok(args.includes('fabrikam'), args.join(' '));
      assert.equal(args.includes('contoso'), false, args.join(' '));
      assert.deepEqual(serverNames(fixture.project), [SERVER]);
      assert.deepEqual(loadManifest(fixture.project).entries[0]!.vars, { ADO_ORG: 'fabrikam' });
    });
  });

  it('changes neither the file nor the manifest on a dry run', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);
      writeProject(fixture.project, installed('contoso', NEW_PKG, { ADO_ORG: 'contoso' }));
      const fileBefore = fs.readFileSync(path.join(fixture.project, MCP_FILE), 'utf8');
      const manifestBefore = fs.readFileSync(
        path.join(fixture.project, '.sigil', 'manifest.json'),
        'utf8',
      );

      await capture(() =>
        runUpdate([], updateOpts(fixture, { vars: { ADO_ORG: 'fabrikam' }, dryRun: true })),
      );

      assert.equal(fs.readFileSync(path.join(fixture.project, MCP_FILE), 'utf8'), fileBefore);
      assert.equal(
        fs.readFileSync(path.join(fixture.project, '.sigil', 'manifest.json'), 'utf8'),
        manifestBefore,
      );
    });
  });

  it('treats a recorded value that fails the rule as missing and leaves the file alone', async () => {
    await withTempDirAsync(async root => {
      const fixture = makeFixture(root);
      writeProject(fixture.project, installed('contoso', NEW_PKG, { ADO_ORG: '-x' }));
      const fileBefore = fs.readFileSync(path.join(fixture.project, MCP_FILE), 'utf8');

      const lines = await capture(() => runUpdate([], updateOpts(fixture)));

      assert.match(lines.join('\n'), /kept as installed: needs ADO_ORG/);
      assert.equal(fs.readFileSync(path.join(fixture.project, MCP_FILE), 'utf8'), fileBefore);
    });
  });
});
