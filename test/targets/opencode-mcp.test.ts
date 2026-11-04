/**
 * OpenCode MCP config: the target writes an `mcp` map into `.opencode/opencode.json` (project)
 * and `opencode.json` under `$XDG_CONFIG_HOME/opencode` (user) through the same merge machinery
 * as its other config.
 *
 * OpenCode's dialect differs from the portable one: `mcp` as the servers key, `{env:NAME}`
 * references (https://opencode.ai/docs/config/), `type: "local"` with a folded `command` array
 * and `environment` (https://opencode.ai/docs/mcp-servers/), and `type: "remote"` on a remote
 * server.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { OpenCodeTarget } from '../../dist-cli/targets/opencode';
import { kindSupport, supportsKind } from '../../dist-cli/targets/capabilities';
import {
  OPENCODE_MCP_DIALECT,
  buildOpenCodeMcpOps,
  openCodeMcpSkipReason,
} from '../../dist-cli/targets/opencode/mcp-ops';
import { resolveConfigRoot } from '../../dist-cli/config-utils';
import { SigilError } from '../../dist-cli/errors';
import { CATALOG_DIR, loadResolvedCatalog } from '../helpers/catalog';
import { withTempDir } from '../helpers/temp-dir';
import type { Artifact, ConfigMergeOp, ResolvedCatalog } from '../../dist-cli/types';

const PROJECT_DIR = '/abs/project';
const MCP_FILE = '.opencode/opencode.json';
const USER_MCP_FILE = 'opencode.json';

/** The single server config one op writes. */
function serverOf(op: ConfigMergeOp, name: string): Record<string, unknown> {
  const servers = op.fragment.mcp as Record<string, Record<string, unknown>>;
  return servers[name]!;
}

/** The one op an mcp artifact renders at `scope`. */
async function onlyOp(
  catalog: ResolvedCatalog,
  id: string,
  scope: 'project' | 'user' = 'project',
): Promise<ConfigMergeOp> {
  const ops = buildOpenCodeMcpOps(catalog.byId.get(id)!, scope);
  assert.equal(ops.length, 1, 'one op per MCP server');
  return ops[0]!;
}

/** A minimal artifact around one authored `server:` block, for the token fixtures. */
function fixtureArtifact(name: string, server: Record<string, unknown>): Artifact {
  return { id: `fixture/${name}`, frontmatter: { name, server } } as unknown as Artifact;
}

describe('OpenCode MCP destinations', () => {
  it('project scope writes .opencode/opencode.json at the project root', async () => {
    const catalog = await loadResolvedCatalog();
    const op = await onlyOp(catalog, 'shared/filesystem', 'project');

    assert.equal(op.file, MCP_FILE);
    assert.equal(op.root, 'project');
    assert.equal(op.section, 'mcp');
    assert.deepEqual(op.strategy, { mcp: 'object-spread' });
  });

  it('user scope writes opencode.json under opencode-home', async () => {
    const catalog = await loadResolvedCatalog();
    const op = await onlyOp(catalog, 'shared/filesystem', 'user');

    assert.equal(op.file, USER_MCP_FILE);
    assert.equal(op.root, 'opencode-home');
  });

  it('refuses local scope, naming .opencode/opencode.json', async () => {
    const catalog = await loadResolvedCatalog();

    assert.throws(
      () => buildOpenCodeMcpOps(catalog.byId.get('shared/filesystem')!, 'local'),
      (err: Error) => {
        assert.ok(err instanceof SigilError);
        assert.match(err.message, /\.opencode\/opencode\.json/);
        return true;
      },
    );
  });
});

describe('OpenCode MCP server config', () => {
  it('filesystem is local: type first, then a folded command array', async () => {
    const catalog = await loadResolvedCatalog();
    const artifact = catalog.byId.get('shared/filesystem')!;
    const authored = artifact.frontmatter.server as { command: string; args: string[] };
    const server = serverOf(await onlyOp(catalog, 'shared/filesystem'), 'filesystem');

    assert.deepEqual(server, {
      type: 'local',
      command: [authored.command, ...authored.args],
    });
    assert.equal(Object.keys(server)[0], 'type', 'type comes first');
    assert.deepEqual(Object.keys(server), ['type', 'command'], 'args is folded into command');
  });

  it('context-mode, with no args, still gets a one-element command', async () => {
    const catalog = await loadResolvedCatalog();
    const server = serverOf(await onlyOp(catalog, 'shared/context-mode'), 'context-mode');

    assert.deepEqual(server, { type: 'local', command: ['context-mode'] });
  });

  it('maku-jam is remote: type first, then url, and one type key', async () => {
    const catalog = await loadResolvedCatalog();
    const server = serverOf(await onlyOp(catalog, 'shared/maku-jam'), 'maku-jam');

    assert.deepEqual(server, { type: 'remote', url: 'https://mcp.jam.dev/mcp' });
    assert.deepEqual(Object.keys(server), ['type', 'url'], 'the authored http type is replaced');
  });

  it('a stdio fixture expands env tokens into environment and the folded command', () => {
    const artifact = fixtureArtifact('token-stdio', {
      command: '{sigil:env:ORG}',
      args: ['--org', '{sigil:env:ORG}'],
      env: { TOKEN: '{sigil:env:TOKEN}' },
    });
    const server = serverOf(buildOpenCodeMcpOps(artifact, 'project')[0]!, 'token-stdio');

    assert.deepEqual(server, {
      type: 'local',
      command: ['{env:ORG}', '--org', '{env:ORG}'],
      environment: { TOKEN: '{env:TOKEN}' },
    });
    assert.equal('env' in server, false, 'env is written as environment');
  });

  it('a remote fixture expands a token in headers', () => {
    const artifact = fixtureArtifact('token-remote', {
      url: 'https://example.test/mcp',
      headers: { Authorization: 'Bearer {sigil:env:TOKEN}' },
    });
    const server = serverOf(buildOpenCodeMcpOps(artifact, 'project')[0]!, 'token-remote');

    assert.deepEqual(server, {
      type: 'remote',
      url: 'https://example.test/mcp',
      headers: { Authorization: 'Bearer {env:TOKEN}' },
    });
  });
});

describe('OpenCode MCP skip reasons', () => {
  it('every catalog mcp artifact renders, so none has a skip reason', async () => {
    const catalog = await loadResolvedCatalog();
    const mcps = catalog.artifacts.filter(artifact => artifact.kind === 'mcp');
    assert.ok(mcps.length > 0, 'the catalog has mcp artifacts');

    for (const artifact of mcps) {
      assert.equal(openCodeMcpSkipReason(artifact), undefined, artifact.id);
    }
  });

  it('the dialect is OpenCode’s: mcp, {env:NAME}, local command array, remote type set', () => {
    assert.equal(OPENCODE_MCP_DIALECT.serversKey, 'mcp');
    assert.equal(OPENCODE_MCP_DIALECT.envSyntax.format('HOME'), '{env:HOME}');
    assert.deepEqual(OPENCODE_MCP_DIALECT.interpolatedFields, [
      'command',
      'args',
      'env',
      'url',
      'headers',
    ]);
    assert.equal(OPENCODE_MCP_DIALECT.envKey, 'environment');
    assert.equal(OPENCODE_MCP_DIALECT.commandForm, 'array');
    assert.equal(OPENCODE_MCP_DIALECT.stdioType, 'local');
    assert.deepEqual(OPENCODE_MCP_DIALECT.remoteType, { set: 'remote' });
  });

  it('leaves no literal {sigil:env: token in any op', async () => {
    const catalog = await loadResolvedCatalog();
    const mcps = catalog.artifacts.filter(artifact => artifact.kind === 'mcp');

    for (const artifact of mcps) {
      for (const scope of ['project', 'user'] as const) {
        const op = buildOpenCodeMcpOps(artifact, scope)[0]!;
        assert.doesNotMatch(JSON.stringify(op.fragment), /\{sigil:env:/, `${artifact.id} ${scope}`);
      }
    }
  });
});

describe('OpenCode MCP config scopes', () => {
  it('offers project and user for mcp', () => {
    const scopes = new OpenCodeTarget().configScopes!(['mcp'], PROJECT_DIR);

    assert.deepEqual(
      scopes.map(scope => scope.value),
      ['project', 'user'],
    );
    for (const scope of scopes) {
      assert.deepEqual(
        scope.destinations.map(destination => destination.kind),
        ['mcp'],
      );
      assert.equal(scope.destinations[0]!.section, 'mcp');
    }

    const project = scopes[0]!.destinations[0]!;
    const user = scopes[1]!.destinations[0]!;
    assert.equal(project.file, MCP_FILE);
    assert.equal(project.fullPath, path.join(PROJECT_DIR, '.opencode', 'opencode.json'));
    assert.equal(user.file, USER_MCP_FILE);
    assert.equal(
      user.fullPath,
      path.join(resolveConfigRoot('opencode-home', PROJECT_DIR), 'opencode.json'),
    );
  });

  it('offers both scopes with empty destinations for hook and settings', () => {
    const scopes = new OpenCodeTarget().configScopes!(['hook', 'settings'], PROJECT_DIR);

    assert.deepEqual(
      scopes.map(scope => scope.value),
      ['project', 'user'],
    );
    for (const scope of scopes) assert.deepEqual(scope.destinations, []);
  });

  it('supports mcp natively on the scaffold channel', () => {
    const target = new OpenCodeTarget();

    assert.equal(supportsKind(target, 'mcp'), true);
    assert.equal(kindSupport(target, 'mcp')!.mode, 'native');
  });

  it('still refuses hook and settings, with their reasons unchanged', () => {
    const target = new OpenCodeTarget();
    const hook = kindSupport(target, 'hook');
    const settings = kindSupport(target, 'settings');

    assert.equal(hook?.mode, 'none');
    assert.equal(
      hook?.mode === 'none' ? hook.reason : undefined,
      "OpenCode hooks are generated code on a plugin API OpenCode 2 doesn't run",
    );
    assert.equal(settings?.mode, 'none');
    assert.equal(
      settings?.mode === 'none' ? settings.reason : undefined,
      "this kind's schema is Claude Code's own vocabulary",
    );
  });

  it('scaffoldConfig on a hook artifact names the one kind it supports', async () => {
    const catalog = await loadResolvedCatalog();
    const hook = catalog.artifacts.find(artifact => artifact.kind === 'hook')!;
    assert.ok(hook, 'the catalog has a hook');

    await assert.rejects(
      () => new OpenCodeTarget().scaffoldConfig!(hook.id, catalog, { projectDir: PROJECT_DIR }),
      /supports only the 'mcp' config kind/,
    );
  });

  it('compile writes no .opencode/opencode.json: MCP is add-only', async () => {
    const files = await new OpenCodeTarget().compile(await loadResolvedCatalog(), {
      version: '0.0.0',
      packs: [],
    });

    assert.equal(files[MCP_FILE], undefined);
    assert.deepEqual(
      Object.keys(files).filter(file => file.endsWith('opencode.json')),
      [],
    );
  });
});

// ── end to end through the built CLI ──────────────────────────────────────────
// Ported from `cursor-mcp.test.ts`'s "Cursor MCP e2e" block: a temp project, a temp HOME, an
// XDG_CONFIG_HOME inside the same temp dir (never the real one), and the bundled catalog copied
// so an update can change what "the catalog" holds.

const CLI = path.resolve(__dirname, '../../dist-cli/cli.js');
const HOME_VAR = process.platform === 'win32' ? 'USERPROFILE' : 'HOME';
const FILESYSTEM = 'shared/filesystem';
const MAKU_JAM = 'shared/maku-jam';
const CATALOG_FILESYSTEM = path.join('shared', 'mcps', 'filesystem.mcp.md');
const CATALOG_FILESYSTEM_ARGS = 'server-filesystem@2026.8.31", "."';
const PROJECT_FILE = path.join('.opencode', 'opencode.json');

/** $XDG_CONFIG_HOME for a test: under the temp HOME, never the real one. */
const xdgOf = (home: string): string => path.join(home, 'xdg-config');

/** The user-scope OpenCode config file for a temp HOME. */
const userFileOf = (home: string): string => path.join(xdgOf(home), 'opencode', 'opencode.json');

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
    env: { ...process.env, [HOME_VAR]: home, XDG_CONFIG_HOME: xdgOf(home) },
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
  target = 'opencode',
): void =>
  sigil(
    project,
    home,
    'add',
    id,
    '--target',
    target,
    '--scope',
    scope,
    '--yes',
    '--catalog-dir',
    catalogDir,
  );

const updateMcp = (project: string, home: string, catalogDir: string, ...extra: string[]) => {
  const done = sigilResult(
    project,
    home,
    'update',
    '--target',
    'opencode',
    '--yes',
    '--catalog-dir',
    catalogDir,
    ...extra,
  );
  assert.equal(done.status, 0, `${done.stdout ?? ''}${done.stderr ?? ''}`);
  return done;
};

const uninstallMcp = (project: string, home: string, id: string, target = 'opencode'): void =>
  sigil(project, home, 'uninstall', id, '--target', target, '--yes');

const readJson = (file: string): Record<string, any> => JSON.parse(fs.readFileSync(file, 'utf8'));

/** The `mcp` map of an OpenCode file. */
const serversOf = (file: string): Record<string, Record<string, unknown>> => readJson(file).mcp;

const CATALOG_SERVER = {
  type: 'local',
  command: ['npx', '-y', '@modelcontextprotocol/server-filesystem@2026.8.31', '.'],
};

describe('OpenCode MCP e2e', () => {
  it('case 1: add writes a file holding only mcp.filesystem', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const file = path.join(project, PROJECT_FILE);

      addMcp(project, home, catalogDir, FILESYSTEM);

      const json = readJson(file);
      assert.deepEqual(Object.keys(json), ['mcp']);
      assert.deepEqual(Object.keys(json.mcp), ['filesystem']);
      assert.deepEqual(json.mcp.filesystem, CATALOG_SERVER);
    });
  });

  it('case 2: add over a user file keeps the mine server and top-level key in order', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const file = path.join(project, PROJECT_FILE);
      const mine = { command: 'echo' };
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ model: 'fast', mcp: { mine } }, null, 2));
      const topKeysBefore = Object.keys(readJson(file));

      addMcp(project, home, catalogDir, FILESYSTEM);

      const json = readJson(file);
      assert.deepEqual(Object.keys(json), topKeysBefore);
      assert.equal(json.model, 'fast');
      assert.deepEqual(Object.keys(json.mcp), ['mine', 'filesystem']);
      assert.deepEqual(json.mcp.mine, mine);
      assert.deepEqual(json.mcp.filesystem, CATALOG_SERVER);
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
      fs.writeFileSync(file, JSON.stringify({ model: 'fast', mcp: { mine } }, null, 2));
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
      assert.deepEqual(json.mcp.filesystem.command, [
        'npx',
        '-y',
        '@modelcontextprotocol/server-filesystem@2026.8.31',
        'changed-dir',
      ]);
      assert.deepEqual(json.mcp.mine, mine);
    });
  });

  it('case 5: a deleted entry is restored as drift "missing", without --force', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const file = path.join(project, PROJECT_FILE);

      addMcp(project, home, catalogDir, FILESYSTEM);
      const json = readJson(file);
      delete json.mcp.filesystem;
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
      json.mcp.filesystem.command = ['npx', '-y', 'USER-EDIT'];
      fs.writeFileSync(file, JSON.stringify(json, null, 2));

      updateMcp(project, home, catalogDir);
      assert.deepEqual(
        serversOf(file).filesystem!.command,
        ['npx', '-y', 'USER-EDIT'],
        'edit kept',
      );

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
      fs.writeFileSync(file, JSON.stringify({ model: 'fast', mcp: { mine } }, null, 2));
      addMcp(project, home, catalogDir, FILESYSTEM);

      uninstallMcp(project, home, FILESYSTEM);

      assert.ok(fs.existsSync(file), 'the user file stays');
      const json = readJson(file);
      assert.deepEqual(Object.keys(json.mcp), ['mine']);
      assert.deepEqual(json.mcp.mine, mine);
      assert.equal(json.model, 'fast');
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
      const userFile = userFileOf(home);
      const backup = `${userFile}.sigil.bak`;
      const userServer = { command: 'echo', args: ['user-server'] };
      fs.mkdirSync(path.dirname(userFile), { recursive: true });
      fs.writeFileSync(userFile, JSON.stringify({ mcp: { mine: userServer } }));
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
        ['opencode.json.sigil.bak'],
        'no second backup file',
      );
      assert.deepEqual(Object.keys(serversOf(userFile)), ['mine', 'filesystem', 'maku-jam']);
    });
  });

  it('case 10: user scope with no prior file takes no backup', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const userFile = userFileOf(home);

      addMcp(project, home, catalogDir, FILESYSTEM, 'user');

      assert.ok(fs.existsSync(userFile), 'the user file was written');
      assert.deepEqual(
        fs.readdirSync(path.dirname(userFile)).filter(name => name.endsWith('.sigil.bak')),
        [],
        'nothing to back up',
      );
    });
  });

  it('case 11: --scope local fails, naming .opencode/opencode.json and writing nothing', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);

      const done = sigilResult(
        project,
        home,
        'add',
        FILESYSTEM,
        '--target',
        'opencode',
        '--scope',
        'local',
        '--yes',
        '--catalog-dir',
        catalogDir,
      );

      assert.notEqual(done.status, 0);
      assert.match(`${done.stdout ?? ''}${done.stderr ?? ''}`, /\.opencode\/opencode\.json/);
      assert.equal(fs.existsSync(path.join(project, PROJECT_FILE)), false);
      assert.equal(fs.existsSync(userFileOf(home)), false);
    });
  });

  it('case 12: a root opencode.jsonc is byte-identical at project and user scope', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const jsonc = path.join(project, 'opencode.jsonc');
      const jsoncBytes = Buffer.from('{\n  // my settings\n  "model": "fast"\n}\n');
      fs.writeFileSync(jsonc, jsoncBytes);

      addMcp(project, home, catalogDir, FILESYSTEM, 'project');
      addMcp(project, home, catalogDir, FILESYSTEM, 'user');

      assert.ok(fs.readFileSync(jsonc).equals(jsoncBytes), 'the .jsonc is byte-identical');
      assert.deepEqual(serversOf(path.join(project, PROJECT_FILE)), { filesystem: CATALOG_SERVER });
      assert.deepEqual(serversOf(userFileOf(home)), { filesystem: CATALOG_SERVER });
    });
  });

  it('case 13: user scope leaves an opencode.jsonc in the home dir untouched, no backup', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const userDir = path.dirname(userFileOf(home));
      const jsonc = path.join(userDir, 'opencode.jsonc');
      const jsoncBytes = Buffer.from('{\n  // user settings\n  "model": "fast"\n}\n');
      fs.mkdirSync(userDir, { recursive: true });
      fs.writeFileSync(jsonc, jsoncBytes);

      addMcp(project, home, catalogDir, FILESYSTEM, 'user');

      assert.ok(fs.readFileSync(jsonc).equals(jsoncBytes), 'the .jsonc is byte-identical');
      assert.ok(fs.existsSync(userFileOf(home)), 'opencode.json is created beside it');
      assert.deepEqual(serversOf(userFileOf(home)), { filesystem: CATALOG_SERVER });
      assert.deepEqual(
        fs.readdirSync(userDir).filter(name => name.endsWith('.sigil.bak')),
        [],
        'nothing to back up',
      );
    });
  });

  it('case 14: an added $schema is no drift; uninstall leaves only $schema', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const file = path.join(project, PROJECT_FILE);

      addMcp(project, home, catalogDir, FILESYSTEM);
      const baseBytes = fs.readFileSync(file, 'utf8');
      const schemaLine = '  "$schema": "https://opencode.ai/config.json",\n';
      const withSchema = baseBytes.replace('{\n', '{\n' + schemaLine);
      assert.notEqual(withSchema, baseBytes, 'the $schema line was inserted');
      fs.writeFileSync(file, withSchema);

      const done = updateMcp(project, home, catalogDir);

      assert.doesNotMatch(
        `${done.stdout ?? ''}${done.stderr ?? ''}`,
        /values were changed|would skip/,
        'no modified drift',
      );
      assert.equal(fs.readFileSync(file, 'utf8'), withSchema, "case 3's bytes aside from $schema");

      uninstallMcp(project, home, FILESYSTEM);

      assert.deepEqual(readJson(file), { $schema: 'https://opencode.ai/config.json' });
    });
  });

  it('case 15: a server with a {sigil:env:NAME} token prints the caveat', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      fs.writeFileSync(
        path.join(catalogDir, 'shared', 'mcps', 'token-server.mcp.md'),
        [
          '---',
          'id: shared/token-server',
          'kind: mcp',
          'title: "Token MCP Server"',
          'description: "Fixture server that reads TOKEN from the environment."',
          'server:',
          '  command: "npx"',
          '  args: ["-y", "token-server"]',
          '  env:',
          '    TOKEN: "{sigil:env:TOKEN}"',
          'tags: [mcp, tools, shared]',
          '---',
          'Fixture server.',
          '',
        ].join('\n'),
      );

      const done = sigilResult(
        project,
        home,
        'add',
        'shared/token-server',
        '--target',
        'opencode',
        '--scope',
        'project',
        '--yes',
        '--catalog-dir',
        catalogDir,
      );

      assert.equal(done.status, 0, `${done.stdout ?? ''}${done.stderr ?? ''}`);
      assert.match(done.stderr ?? '', /an unset variable becomes an empty string/);
      assert.deepEqual(serversOf(path.join(project, PROJECT_FILE)), {
        'token-server': {
          type: 'local',
          command: ['npx', '-y', 'token-server'],
          environment: { TOKEN: '{env:TOKEN}' },
        },
      });
    });
  });

  it('case 16: claude and opencode each get one entry; uninstalling one leaves the other intact', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const claudeFile = path.join(project, '.mcp.json');
      const openCodeFile = path.join(project, PROJECT_FILE);

      addMcp(project, home, catalogDir, FILESYSTEM, 'project', 'claude');
      addMcp(project, home, catalogDir, FILESYSTEM);

      assert.deepEqual(Object.keys(readJson(claudeFile).mcpServers), ['filesystem']);
      assert.deepEqual(Object.keys(serversOf(openCodeFile)), ['filesystem']);

      const claudeBefore = fs.readFileSync(claudeFile);
      uninstallMcp(project, home, FILESYSTEM, 'opencode');

      assert.ok(
        fs.readFileSync(claudeFile).equals(claudeBefore),
        'the Claude file is byte-identical after the OpenCode uninstall',
      );

      addMcp(project, home, catalogDir, FILESYSTEM);
      const openCodeBefore = fs.readFileSync(openCodeFile);
      uninstallMcp(project, home, FILESYSTEM, 'claude');

      assert.ok(
        fs.readFileSync(openCodeFile).equals(openCodeBefore),
        'the OpenCode file is byte-identical after the Claude uninstall',
      );
    });
  });
});
