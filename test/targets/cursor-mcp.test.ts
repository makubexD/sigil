/**
 * Cursor MCP config: the target writes an `mcpServers` map into `.cursor/mcp.json` (project) and
 * `~/.cursor/mcp.json` (user) through the same merge machinery as its hook file.
 *
 * Cursor's dialect differs from the portable one: `${env:NAME}` references, `type: "stdio"` on a
 * stdio server, and no `type` on a remote one (docs/decisions/cursor-target-2026-11.md, probe A6
 * and § Phase D probes).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CursorTarget } from '../../dist-cli/targets/cursor';
import {
  CURSOR_MCP_DIALECT,
  buildCursorMcpOps,
  cursorMcpSkipReason,
} from '../../dist-cli/targets/cursor/mcp-ops';
import { SigilError } from '../../dist-cli/errors';
import { CATALOG_DIR, loadResolvedCatalog } from '../helpers/catalog';
import { withEnvMcpFixture } from '../helpers/env-mcp-fixture';
import { withTempDir } from '../helpers/temp-dir';
import type { ConfigMergeOp, ResolvedCatalog } from '../../dist-cli/types';

const PROJECT_DIR = '/abs/project';
const MCP_FILE = '.cursor/mcp.json';

/** The single server config one op writes. */
function serverOf(op: ConfigMergeOp, name: string): Record<string, unknown> {
  const servers = op.fragment.mcpServers as Record<string, Record<string, unknown>>;
  return servers[name]!;
}

/** The one op an mcp artifact renders at `scope`. */
async function onlyOp(
  catalog: ResolvedCatalog,
  id: string,
  scope: 'project' | 'user' = 'project',
): Promise<ConfigMergeOp> {
  const ops = buildCursorMcpOps(catalog.byId.get(id)!, scope);
  assert.equal(ops.length, 1, 'one op per MCP server');
  return ops[0]!;
}

describe('Cursor MCP destinations', () => {
  it('project scope writes .cursor/mcp.json at the project root', async () => {
    const catalog = await loadResolvedCatalog();
    const op = await onlyOp(catalog, 'shared/filesystem', 'project');

    assert.equal(op.file, MCP_FILE);
    assert.equal(op.root, 'project');
    assert.equal(op.section, 'mcpServers');
    assert.deepEqual(op.strategy, { mcpServers: 'object-spread' });
  });

  it('user scope writes .cursor/mcp.json under home', async () => {
    const catalog = await loadResolvedCatalog();
    const op = await onlyOp(catalog, 'shared/filesystem', 'user');

    assert.equal(op.file, MCP_FILE);
    assert.equal(op.root, 'home');
  });

  it('refuses local scope, naming .cursor/mcp.json', async () => {
    const catalog = await loadResolvedCatalog();

    assert.throws(
      () => buildCursorMcpOps(catalog.byId.get('shared/filesystem')!, 'local'),
      (err: Error) => {
        assert.ok(err instanceof SigilError);
        assert.match(err.message, /\.cursor\/mcp\.json/);
        return true;
      },
    );
  });
});

describe('Cursor MCP server config', () => {
  it('filesystem is stdio: type first, then command and args', async () => {
    const catalog = await loadResolvedCatalog();
    const server = serverOf(await onlyOp(catalog, 'shared/filesystem'), 'filesystem');

    assert.deepEqual(server, {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem@2026.8.31', '.'],
    });
    assert.equal(Object.keys(server)[0], 'type', 'type comes first');
  });

  it('maku-jam is remote and carries no type', async () => {
    const catalog = await loadResolvedCatalog();
    const server = serverOf(await onlyOp(catalog, 'shared/maku-jam'), 'maku-jam');

    assert.deepEqual(server, { url: 'https://mcp.jam.dev/mcp' });
  });

  it('ado expands both env references to Cursor syntax', async () => {
    const catalog = withEnvMcpFixture(await loadResolvedCatalog());
    const server = serverOf(await onlyOp(catalog, 'shared/ado'), 'ado');

    assert.ok((server.args as string[]).includes('${env:ADO_ORG}'));
    assert.deepEqual(server.env, { ADO_MCP_PERSONAL_TOKEN: '${env:ADO_MCP_PERSONAL_TOKEN}' });
    assert.equal(server.type, 'stdio');
  });
});

describe('Cursor MCP skip reasons', () => {
  it('every catalog mcp artifact renders, so none has a skip reason', async () => {
    const catalog = await loadResolvedCatalog();
    const target = new CursorTarget();
    const mcps = catalog.artifacts.filter(artifact => artifact.kind === 'mcp');
    assert.ok(mcps.length > 0, 'the catalog has mcp artifacts');

    for (const artifact of mcps) {
      assert.equal(cursorMcpSkipReason(artifact), undefined, artifact.id);
      assert.equal(target.configSkipReason!(artifact), undefined, artifact.id);
    }
  });

  it("the dialect is Cursor's: mcpServers, ${env:NAME}, stdio written, remote type dropped", () => {
    assert.equal(CURSOR_MCP_DIALECT.serversKey, 'mcpServers');
    assert.equal(CURSOR_MCP_DIALECT.envSyntax.format('HOME'), '${env:HOME}');
    assert.deepEqual(CURSOR_MCP_DIALECT.interpolatedFields, [
      'command',
      'args',
      'env',
      'url',
      'headers',
    ]);
    assert.equal(CURSOR_MCP_DIALECT.stdioType, 'stdio');
    assert.equal(CURSOR_MCP_DIALECT.remoteType, 'drop');
  });
});

describe('Cursor MCP config scopes', () => {
  it('offers project and user for both hook and mcp', () => {
    const scopes = new CursorTarget().configScopes!(['hook', 'mcp'], PROJECT_DIR);

    assert.deepEqual(
      scopes.map(scope => scope.value),
      ['project', 'user'],
    );
    for (const scope of scopes) {
      assert.deepEqual(
        scope.destinations.map(destination => destination.kind),
        ['hook', 'mcp'],
      );
      const byKind = new Map(
        scope.destinations.map(destination => [destination.kind, destination]),
      );
      assert.equal(byKind.get('hook')!.section, 'hooks');
      assert.equal(byKind.get('mcp')!.section, 'mcpServers');
      assert.equal(byKind.get('mcp')!.file, MCP_FILE);
    }

    const project = scopes[0]!.destinations[1]!;
    const user = scopes[1]!.destinations[1]!;
    assert.equal(project.fullPath, path.join(PROJECT_DIR, '.cursor', 'mcp.json'));
    assert.match(user.fullPath, /\.cursor[/\\]mcp\.json$/);
  });
});

// ── end to end through the built CLI ──────────────────────────────────────────
// Copied from `cursor-hooks.test.ts`'s "Cursor hook e2e" block: a temp project, a temp HOME, and
// the bundled catalog copied so an update can change what "the catalog" holds.

const CLI = path.resolve(__dirname, '../../dist-cli/cli.js');
const HOME_VAR = process.platform === 'win32' ? 'USERPROFILE' : 'HOME';
const FILESYSTEM = 'shared/filesystem';
const MAKU_JAM = 'shared/maku-jam';
const CATALOG_FILESYSTEM = path.join('shared', 'mcps', 'filesystem.mcp.md');
const CATALOG_FILESYSTEM_ARGS = 'server-filesystem@2026.8.31", "."';

/** A project dir and a home dir, both empty. */
function makeDirs(work: string): { project: string; home: string } {
  const project = path.join(work, 'project');
  const home = path.join(work, 'home');
  fs.mkdirSync(project);
  fs.mkdirSync(home);
  return { project, home };
}

/** The bundled catalog, copied so a test can edit what the catalog holds. */
function copyCatalog(work: string): string {
  const catalogDir = path.join(work, 'catalog');
  fs.cpSync(CATALOG_DIR, catalogDir, { recursive: true });
  return catalogDir;
}

/** Runs the built CLI and returns the spawn result, for cases expected to fail. */
function sigilResult(cwd: string, home: string, ...args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args, '--project-dir', cwd], {
    cwd,
    encoding: 'utf8',
    input: '',
    windowsHide: true,
    env: { ...process.env, [HOME_VAR]: home },
  });
}

/** Runs the built CLI in `cwd` with HOME pointed at `home`, and asserts it exited 0. */
function sigil(cwd: string, home: string, ...args: string[]): void {
  const done = sigilResult(cwd, home, ...args);
  assert.equal(done.status, 0, `${done.stdout ?? ''}${done.stderr ?? ''}`);
}

const addMcp = (
  project: string,
  home: string,
  catalogDir: string,
  id: string,
  scope = 'project',
): void =>
  sigil(
    project,
    home,
    'add',
    id,
    '--target',
    'cursor',
    '--scope',
    scope,
    '--yes',
    '--catalog-dir',
    catalogDir,
  );

const updateMcp = (project: string, home: string, catalogDir: string, ...extra: string[]): void =>
  sigil(
    project,
    home,
    'update',
    '--target',
    'cursor',
    '--yes',
    '--catalog-dir',
    catalogDir,
    ...extra,
  );

const uninstallMcp = (project: string, home: string, id: string, target = 'cursor'): void =>
  sigil(project, home, 'uninstall', id, '--target', target, '--yes');

const readJson = (file: string): Record<string, any> => JSON.parse(fs.readFileSync(file, 'utf8'));

/** The `mcpServers` map of a Cursor or Claude MCP file. */
const serversOf = (file: string): Record<string, Record<string, unknown>> =>
  readJson(file).mcpServers;

const CATALOG_SERVER = {
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem@2026.8.31', '.'],
};

const PROJECT_FILE = path.join('.cursor', 'mcp.json');

describe('Cursor MCP e2e', () => {
  it('case 1: add writes a file holding only mcpServers.filesystem', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const file = path.join(project, PROJECT_FILE);

      addMcp(project, home, catalogDir, FILESYSTEM);

      const json = readJson(file);
      assert.deepEqual(Object.keys(json), ['mcpServers']);
      assert.deepEqual(Object.keys(json.mcpServers), ['filesystem']);
      assert.deepEqual(json.mcpServers.filesystem, CATALOG_SERVER);
    });
  });

  it('case 2: add over a user file keeps the mine server and top-level key in order', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const file = path.join(project, PROJECT_FILE);
      const mine = { command: 'echo' };
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ someKey: true, mcpServers: { mine } }, null, 2));
      const topKeysBefore = Object.keys(readJson(file));

      addMcp(project, home, catalogDir, FILESYSTEM);

      const json = readJson(file);
      assert.deepEqual(Object.keys(json), topKeysBefore);
      assert.equal(json.someKey, true);
      assert.deepEqual(Object.keys(json.mcpServers), ['mine', 'filesystem']);
      assert.deepEqual(json.mcpServers.mine, mine);
      assert.deepEqual(json.mcpServers.filesystem, CATALOG_SERVER);
    });
  });

  it('case 3: add again leaves the file byte-identical', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const file = path.join(project, PROJECT_FILE);

      addMcp(project, home, catalogDir, FILESYSTEM);
      const afterFirst = fs.readFileSync(file);
      addMcp(project, home, catalogDir, FILESYSTEM);

      assert.ok(fs.readFileSync(file).equals(afterFirst), 'no second entry, no reformat');
    });
  });

  it('case 4: update after the catalog server changes replaces the entry, mine untouched', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const file = path.join(project, PROJECT_FILE);
      const mine = { command: 'echo' };
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ someKey: true, mcpServers: { mine } }, null, 2));
      addMcp(project, home, catalogDir, FILESYSTEM);

      const catalogFile = path.join(catalogDir, CATALOG_FILESYSTEM);
      const source = fs.readFileSync(catalogFile, 'utf8');
      assert.ok(source.includes(CATALOG_FILESYSTEM_ARGS), 'the fixture line is present');
      fs.writeFileSync(
        catalogFile,
        source.replace(CATALOG_FILESYSTEM_ARGS, 'server-filesystem@2026.8.31", "changed-dir"'),
      );
      updateMcp(project, home, catalogDir);

      const json = readJson(file);
      assert.deepEqual(json.mcpServers.filesystem.args, [
        '-y',
        '@modelcontextprotocol/server-filesystem@2026.8.31',
        'changed-dir',
      ]);
      assert.deepEqual(json.mcpServers.mine, mine);
    });
  });

  it('case 5: a deleted entry is restored as drift "missing", without --force', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const file = path.join(project, PROJECT_FILE);

      addMcp(project, home, catalogDir, FILESYSTEM);
      const json = readJson(file);
      delete json.mcpServers.filesystem;
      fs.writeFileSync(file, JSON.stringify(json, null, 2));

      updateMcp(project, home, catalogDir);

      assert.deepEqual(serversOf(file).filesystem, CATALOG_SERVER);
    });
  });

  it('case 6: an edited entry is drift "modified": kept without --force, restored with it', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const file = path.join(project, PROJECT_FILE);

      addMcp(project, home, catalogDir, FILESYSTEM);
      const json = readJson(file);
      json.mcpServers.filesystem.args = ['-y', 'USER-EDIT'];
      fs.writeFileSync(file, JSON.stringify(json, null, 2));

      updateMcp(project, home, catalogDir);
      assert.deepEqual(serversOf(file).filesystem!.args, ['-y', 'USER-EDIT'], 'edit kept');

      updateMcp(project, home, catalogDir, '--force');
      assert.deepEqual(serversOf(file).filesystem, CATALOG_SERVER, 'catalog value restored');
    });
  });

  it('case 7: uninstall removes only filesystem and keeps the mine server', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const file = path.join(project, PROJECT_FILE);
      const mine = { command: 'echo' };
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ someKey: true, mcpServers: { mine } }, null, 2));
      addMcp(project, home, catalogDir, FILESYSTEM);

      uninstallMcp(project, home, FILESYSTEM);

      assert.ok(fs.existsSync(file), 'the user file stays');
      const json = readJson(file);
      assert.deepEqual(Object.keys(json.mcpServers), ['mine']);
      assert.deepEqual(json.mcpServers.mine, mine);
      assert.equal(json.someKey, true);
    });
  });

  it('case 8: uninstalling from a sigil-only file removes the file', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const file = path.join(project, PROJECT_FILE);

      addMcp(project, home, catalogDir, FILESYSTEM);
      uninstallMcp(project, home, FILESYSTEM);

      assert.equal(fs.existsSync(file), false);
    });
  });

  it('case 9: user scope takes one .sigil.bak before the first write, none after', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const userFile = path.join(home, PROJECT_FILE);
      const backup = `${userFile}.sigil.bak`;
      const userServer = { command: 'echo', args: ['user-server'] };
      fs.mkdirSync(path.dirname(userFile), { recursive: true });
      fs.writeFileSync(userFile, JSON.stringify({ mcpServers: { mine: userServer } }));
      const originalBytes = fs.readFileSync(userFile);

      addMcp(project, home, catalogDir, FILESYSTEM, 'user');

      const afterFirst = serversOf(userFile);
      assert.deepEqual(Object.keys(afterFirst), ['mine', 'filesystem']);
      assert.deepEqual(afterFirst.mine, userServer, 'the user server is kept');
      assert.ok(fs.existsSync(backup), 'the backup exists');
      assert.ok(fs.readFileSync(backup).equals(originalBytes), 'the backup is the original bytes');

      addMcp(project, home, catalogDir, MAKU_JAM, 'user');

      assert.ok(
        fs.readFileSync(backup).equals(originalBytes),
        'a second add leaves the backup unchanged',
      );
      assert.deepEqual(
        fs.readdirSync(path.dirname(userFile)).filter(name => name.endsWith('.sigil.bak')),
        ['mcp.json.sigil.bak'],
        'no second backup file',
      );
      assert.deepEqual(Object.keys(serversOf(userFile)), ['mine', 'filesystem', 'maku-jam']);
    });
  });

  it('case 10: user scope with no prior file takes no backup', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const userFile = path.join(home, PROJECT_FILE);

      addMcp(project, home, catalogDir, FILESYSTEM, 'user');

      assert.ok(fs.existsSync(userFile), 'the user file was written');
      assert.deepEqual(
        fs.readdirSync(path.dirname(userFile)).filter(name => name.endsWith('.sigil.bak')),
        [],
        'nothing to back up',
      );
    });
  });

  it('case 11: --scope local fails, naming .cursor/mcp.json and writing nothing', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);

      const done = sigilResult(
        project,
        home,
        'add',
        FILESYSTEM,
        '--target',
        'cursor',
        '--scope',
        'local',
        '--yes',
        '--catalog-dir',
        catalogDir,
      );

      assert.notEqual(done.status, 0);
      assert.match(`${done.stdout ?? ''}${done.stderr ?? ''}`, /\.cursor\/mcp\.json/);
      assert.equal(fs.existsSync(path.join(project, PROJECT_FILE)), false);
      assert.equal(fs.existsSync(path.join(home, PROJECT_FILE)), false);
    });
  });

  it('case 12: claude and cursor each get one entry; uninstalling one target leaves the other file intact', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const claudeFile = path.join(project, '.mcp.json');
      const cursorFile = path.join(project, PROJECT_FILE);

      sigil(
        project,
        home,
        'add',
        FILESYSTEM,
        '--target',
        'claude',
        '--scope',
        'project',
        '--yes',
        '--catalog-dir',
        catalogDir,
      );
      addMcp(project, home, catalogDir, FILESYSTEM);

      assert.deepEqual(Object.keys(serversOf(claudeFile)), ['filesystem']);
      assert.deepEqual(Object.keys(serversOf(cursorFile)), ['filesystem']);

      const claudeBefore = fs.readFileSync(claudeFile);
      uninstallMcp(project, home, FILESYSTEM, 'cursor');

      assert.ok(
        fs.readFileSync(claudeFile).equals(claudeBefore),
        'the Claude file is byte-identical after the Cursor uninstall',
      );

      addMcp(project, home, catalogDir, FILESYSTEM);
      const cursorBefore = fs.readFileSync(cursorFile);
      uninstallMcp(project, home, FILESYSTEM, 'claude');

      assert.ok(
        fs.readFileSync(cursorFile).equals(cursorBefore),
        'the Cursor file is byte-identical after the Claude uninstall',
      );
    });
  });
});
