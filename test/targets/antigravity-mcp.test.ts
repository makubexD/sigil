/**
 * Antigravity MCP config: the target writes an `mcpServers` map into `.agents/mcp_config.json`
 * (project) and `~/.gemini/config/mcp_config.json` (user) through the same merge machinery as
 * Cursor's MCP file (docs/decisions/antigravity-target-2026-11.md, probe C1).
 *
 * Antigravity's dialect expands no environment references: an identity env entry is dropped and
 * any other token skips the server (P5 and C1 in docs/decisions/antigravity-target-2026-11.md).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getTarget } from '../../dist-cli/targets/index';
import {
  antigravityMcpSkipReason,
  buildAntigravityMcpOps,
} from '../../dist-cli/targets/antigravity/mcp-ops';
import { SigilError } from '../../dist-cli/errors';
import { CATALOG_DIR, loadResolvedCatalog } from '../helpers/catalog';
import { ENV_MCP_MARKDOWN, withEnvMcpFixture } from '../helpers/env-mcp-fixture';
import { withTempDir } from '../helpers/temp-dir';
import type { ConfigMergeOp, ResolvedCatalog } from '../../dist-cli/types';

const PROJECT_DIR = '/abs/project';
const PROJECT_FILE = '.agents/mcp_config.json';
const USER_FILE = '.gemini/config/mcp_config.json';
const FILESYSTEM = 'shared/filesystem';

/** The single server config one op writes. */
function serverOf(op: ConfigMergeOp, name: string): Record<string, unknown> {
  const servers = op.fragment.mcpServers as Record<string, Record<string, unknown>>;
  return servers[name]!;
}

/** The one op an mcp artifact renders at `scope`. */
function onlyOp(
  catalog: ResolvedCatalog,
  id: string,
  scope: 'project' | 'user' = 'project',
): ConfigMergeOp {
  const ops = buildAntigravityMcpOps(catalog.byId.get(id)!, scope);
  assert.equal(ops.length, 1, 'one op per MCP server');
  return ops[0]!;
}

describe('Antigravity MCP destinations', () => {
  it('project scope writes .agents/mcp_config.json at the project root', async () => {
    const catalog = await loadResolvedCatalog();
    const op = onlyOp(catalog, FILESYSTEM, 'project');

    assert.equal(op.file, PROJECT_FILE);
    assert.equal(op.root, 'project');
    assert.equal(op.section, 'mcpServers');
    assert.deepEqual(op.strategy, { mcpServers: 'object-spread' });
  });

  it('user scope writes .gemini/config/mcp_config.json under home', async () => {
    const catalog = await loadResolvedCatalog();
    const op = onlyOp(catalog, FILESYSTEM, 'user');

    assert.equal(op.file, USER_FILE);
    assert.equal(op.root, 'home');
  });

  it('refuses local scope, naming both supported files', async () => {
    const catalog = await loadResolvedCatalog();

    assert.throws(
      () => buildAntigravityMcpOps(catalog.byId.get(FILESYSTEM)!, 'local'),
      (err: Error) => {
        assert.ok(err instanceof SigilError);
        assert.match(err.message, /\.agents\/mcp_config\.json/);
        assert.match(err.message, /\.gemini\/config\/mcp_config\.json/);
        return true;
      },
    );
  });
});

describe('Antigravity MCP server config', () => {
  it('filesystem is stdio: command and args, no type', async () => {
    const catalog = await loadResolvedCatalog();
    const server = serverOf(onlyOp(catalog, FILESYSTEM), 'filesystem');

    assert.deepEqual(server, {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem@2026.8.31', '.'],
    });
    assert.equal('type' in server, false, 'no type key');
  });

  it('context-mode carries only its command', async () => {
    const catalog = await loadResolvedCatalog();
    const server = serverOf(onlyOp(catalog, 'shared/context-mode'), 'context-mode');

    assert.deepEqual(server, { command: 'context-mode' });
  });

  it('maku-jam is remote and carries no type', async () => {
    const catalog = await loadResolvedCatalog();
    const server = serverOf(onlyOp(catalog, 'shared/maku-jam'), 'maku-jam');

    assert.deepEqual(server, { url: 'https://mcp.jam.dev/mcp' });
  });
});

describe('Antigravity MCP skip reasons', () => {
  it('ado is skipped for its organization token in args', async () => {
    const catalog = withEnvMcpFixture(await loadResolvedCatalog());
    const reason = antigravityMcpSkipReason(catalog.byId.get('shared/ado')!);

    assert.match(reason!, /\{sigil:env:ADO_ORG\}/);
    assert.match(reason!, /args/);
  });

  it('the other catalog servers render, so they have no skip reason', async () => {
    const catalog = await loadResolvedCatalog();

    for (const id of [FILESYSTEM, 'shared/context-mode', 'shared/maku-jam']) {
      assert.equal(antigravityMcpSkipReason(catalog.byId.get(id)!), undefined, id);
    }
  });
});

describe('Antigravity target MCP wiring', () => {
  it('skips ado with the dialect reason', async () => {
    const catalog = withEnvMcpFixture(await loadResolvedCatalog());
    const artifact = catalog.byId.get('shared/ado')!;

    assert.equal(
      getTarget('antigravity').configSkipReason!(artifact),
      antigravityMcpSkipReason(artifact),
    );
    assert.match(antigravityMcpSkipReason(artifact)!, /\{sigil:env:ADO_ORG\}/);
  });

  it('renders the other catalog servers, so they have no skip reason', async () => {
    const catalog = await loadResolvedCatalog();

    for (const id of [FILESYSTEM, 'shared/context-mode', 'shared/maku-jam']) {
      assert.equal(
        getTarget('antigravity').configSkipReason!(catalog.byId.get(id)!),
        undefined,
        id,
      );
    }
  });

  it('offers project then user, section mcpServers and the two display strings', () => {
    const scopes = getTarget('antigravity').configScopes!(['mcp'], PROJECT_DIR);

    assert.deepEqual(
      scopes.map(scope => scope.value),
      ['project', 'user'],
    );
    assert.deepEqual(
      scopes.map(scope => scope.description),
      [
        'project — .agents/hooks.json and .agents/mcp_config.json, git-committed',
        'user — ~/.gemini/config/hooks.json and ~/.gemini/config/mcp_config.json, all projects',
      ],
    );
    for (const scope of scopes) {
      assert.deepEqual(
        scope.destinations.map(destination => destination.kind),
        ['mcp'],
      );
      assert.equal(scope.destinations[0]!.section, 'mcpServers');
    }
    assert.equal(scopes[0]!.destinations[0]!.file, PROJECT_FILE);
    assert.equal(scopes[0]!.destinations[0]!.fullPath, path.join(PROJECT_DIR, PROJECT_FILE));
    assert.equal(scopes[1]!.destinations[0]!.file, USER_FILE);
  });

  it('scaffolds the user-scope op the dialect builds', async () => {
    const catalog = await loadResolvedCatalog();

    assert.deepEqual(
      await getTarget('antigravity').scaffoldConfig!(FILESYSTEM, catalog, {
        scope: 'user',
        projectDir: PROJECT_DIR,
      }),
      buildAntigravityMcpOps(catalog.byId.get(FILESYSTEM)!, 'user'),
    );
  });
});

// ── end to end through the built CLI ──────────────────────────────────────────
// Same setup as `cursor-mcp.test.ts`'s "Cursor MCP e2e" block: a temp project and a temp HOME (so
// the user-scope cases never touch the real ~/.gemini), and the bundled catalog copied so an
// update can change what "the catalog" holds.

const CLI = path.resolve(__dirname, '../../dist-cli/cli.js');
const HOME_VAR = process.platform === 'win32' ? 'USERPROFILE' : 'HOME';
const MAKU_JAM = 'shared/maku-jam';
const ADO = 'shared/ado';
const CLI_TARGET = 'antigravity';
const CATALOG_FILESYSTEM = path.join('shared', 'mcps', 'filesystem.mcp.md');
const CATALOG_ADO = path.join('shared', 'mcps', 'ado.mcp.md');
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
    CLI_TARGET,
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
    CLI_TARGET,
    '--yes',
    '--catalog-dir',
    catalogDir,
    ...extra,
  );

const uninstallMcp = (project: string, home: string, id: string, target = CLI_TARGET): void =>
  sigil(project, home, 'uninstall', id, '--target', target, '--yes');

const readJson = (file: string): Record<string, any> => JSON.parse(fs.readFileSync(file, 'utf8'));

/** The `mcpServers` map of an Antigravity MCP file. */
const serversOf = (file: string): Record<string, Record<string, unknown>> =>
  readJson(file).mcpServers;

const CATALOG_SERVER = {
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem@2026.8.31', '.'],
};

describe('Antigravity MCP e2e', () => {
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
      const userFile = path.join(home, USER_FILE);
      const backup = `${userFile}.sigil.bak`;
      const userServer = { command: 'echo', args: ['user-server'] };
      fs.mkdirSync(path.dirname(userFile), { recursive: true });
      fs.writeFileSync(userFile, JSON.stringify({ mcpServers: { mine: userServer } }));
      const originalBytes = fs.readFileSync(userFile);
      // A sibling in ~/.gemini/ that a user-scope write must leave alone.
      const sibling = path.join(home, '.gemini', 'GEMINI.md');
      fs.writeFileSync(sibling, 'owner content\n');

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
        ['mcp_config.json.sigil.bak'],
        'no second backup file',
      );
      assert.deepEqual(Object.keys(serversOf(userFile)), ['mine', 'filesystem', 'maku-jam']);
      assert.equal(
        fs.readFileSync(sibling, 'utf8'),
        'owner content\n',
        'the rest of ~/.gemini/ is untouched',
      );
    });
  });

  it('case 10: user scope with no prior file creates it, with its folders and no .sigil.bak', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const userFile = path.join(home, USER_FILE);

      addMcp(project, home, catalogDir, FILESYSTEM, 'user');

      assert.ok(fs.existsSync(userFile), 'the user file was written');
      assert.ok(fs.statSync(path.dirname(userFile)).isDirectory(), 'the parent folders exist');
      assert.deepEqual(
        fs.readdirSync(path.dirname(userFile)).filter(name => name.endsWith('.sigil.bak')),
        [],
        'nothing to back up',
      );
    });
  });

  it('case 11: --scope local fails, naming both supported files and writing nothing', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);

      const done = sigilResult(
        project,
        home,
        'add',
        FILESYSTEM,
        '--target',
        CLI_TARGET,
        '--scope',
        'local',
        '--yes',
        '--catalog-dir',
        catalogDir,
      );

      assert.notEqual(done.status, 0);
      const output = `${done.stdout ?? ''}${done.stderr ?? ''}`;
      assert.match(output, /\.agents\/mcp_config\.json/);
      assert.match(output, /\.gemini\/config\/mcp_config\.json/);
      assert.equal(fs.existsSync(path.join(project, PROJECT_FILE)), false);
      assert.equal(fs.existsSync(path.join(home, USER_FILE)), false);
    });
  });

  it('case 12: ado is skipped with the step 3 reason and nothing is written', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const adoFile = path.join(catalogDir, CATALOG_ADO);
      fs.writeFileSync(adoFile, ENV_MCP_MARKDOWN);
      const source = fs.readFileSync(adoFile, 'utf8');
      assert.match(source, /^platforms: .*$/m, 'the bundled source is platform-restricted');
      // A fixture copy without `platforms`, so the skip comes from the MCP dialect, not the
      // platform filter.
      fs.writeFileSync(adoFile, source.replace(/^platforms: .*\n/m, ''));

      const done = sigilResult(
        project,
        home,
        'add',
        ADO,
        '--target',
        CLI_TARGET,
        '--scope',
        'project',
        '--yes',
        '--catalog-dir',
        catalogDir,
      );

      assert.equal(done.status, 0, `${done.stdout ?? ''}${done.stderr ?? ''}`);
      const output = `${done.stdout ?? ''}${done.stderr ?? ''}`;
      assert.match(output, /\{sigil:env:ADO_ORG\}/);
      assert.match(output, /in args is not carried by this target/);
      assert.equal(fs.existsSync(path.join(project, PROJECT_FILE)), false, 'nothing written');
      assert.equal(fs.existsSync(path.join(home, USER_FILE)), false, 'nothing written');
    });
  });

  it('case 13: cursor and antigravity each keep one entry; uninstalling one leaves the other', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const cursorFile = path.join(project, '.cursor', 'mcp.json');
      const antigravityFile = path.join(project, PROJECT_FILE);

      sigil(
        project,
        home,
        'add',
        FILESYSTEM,
        '--target',
        'cursor',
        '--scope',
        'project',
        '--yes',
        '--catalog-dir',
        catalogDir,
      );
      addMcp(project, home, catalogDir, FILESYSTEM);

      assert.deepEqual(Object.keys(serversOf(cursorFile)), ['filesystem']);
      assert.deepEqual(Object.keys(serversOf(antigravityFile)), ['filesystem']);

      const antigravityBefore = fs.readFileSync(antigravityFile);
      uninstallMcp(project, home, FILESYSTEM, 'cursor');
      assert.ok(
        fs.readFileSync(antigravityFile).equals(antigravityBefore),
        'the Antigravity file is byte-identical after the Cursor uninstall',
      );

      sigil(
        project,
        home,
        'add',
        FILESYSTEM,
        '--target',
        'cursor',
        '--scope',
        'project',
        '--yes',
        '--catalog-dir',
        catalogDir,
      );
      const cursorBefore = fs.readFileSync(cursorFile);
      uninstallMcp(project, home, FILESYSTEM);
      assert.ok(
        fs.readFileSync(cursorFile).equals(cursorBefore),
        'the Cursor file is byte-identical after the Antigravity uninstall',
      );
    });
  });

  it('case 14: codex skills and an antigravity MCP server install in one project', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);

      sigil(
        project,
        home,
        'add',
        'shared/cli',
        '--target',
        'codex',
        '--scope',
        'project',
        '--yes',
        '--catalog-dir',
        catalogDir,
      );
      addMcp(project, home, catalogDir, FILESYSTEM);

      assert.ok(
        fs.existsSync(path.join(project, '.agents', 'skills', 'cli', 'SKILL.md')),
        'the codex skill is there',
      );
      assert.deepEqual(serversOf(path.join(project, PROJECT_FILE)).filesystem, CATALOG_SERVER);
    });
  });

  it('names a server whose identity env entry was dropped and prints the env caveat', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const catalogFile = path.join(catalogDir, CATALOG_FILESYSTEM);
      const source = fs.readFileSync(catalogFile, 'utf8');
      fs.writeFileSync(
        catalogFile,
        source.replace(/^tags:/m, '  env:\n    FS_TOKEN: "{sigil:env:FS_TOKEN}"\ntags:'),
      );

      const done = sigilResult(
        project,
        home,
        'add',
        FILESYSTEM,
        '--target',
        CLI_TARGET,
        '--scope',
        'project',
        '--yes',
        '--catalog-dir',
        catalogDir,
      );
      const output = `${done.stdout ?? ''}${done.stderr ?? ''}`;
      assert.equal(done.status, 0, output);
      assert.match(output, /shared\/filesystem reads FS_TOKEN from the environment/);
      assert.match(output, /export each of these before you start agy/);
      assert.equal(serversOf(path.join(project, PROJECT_FILE)).filesystem?.env, undefined);
    });
  });
});
