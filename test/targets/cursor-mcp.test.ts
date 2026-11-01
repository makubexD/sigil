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
import path from 'node:path';
import { CursorTarget } from '../../dist-cli/targets/cursor';
import {
  CURSOR_MCP_DIALECT,
  buildCursorMcpOps,
  cursorMcpSkipReason,
} from '../../dist-cli/targets/cursor/mcp-ops';
import { SigilError } from '../../dist-cli/errors';
import { loadResolvedCatalog } from '../helpers/catalog';
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
    const catalog = await loadResolvedCatalog();
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
