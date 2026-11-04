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
import { loadResolvedCatalog } from '../helpers/catalog';
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
