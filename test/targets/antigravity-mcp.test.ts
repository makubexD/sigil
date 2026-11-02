/**
 * Antigravity MCP config: the target writes an `mcpServers` map into `.agents/mcp_config.json`
 * (project) and `~/.gemini/config/mcp_config.json` (user) through the same merge machinery as
 * Cursor's MCP file (docs/plan-antigravity-target-c.md step 3).
 *
 * Antigravity's dialect expands no environment references: an identity env entry is dropped and
 * any other token skips the server (P5 and C1 in docs/decisions/antigravity-target-2026-11.md).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { getTarget } from '../../dist-cli/targets/index';
import {
  antigravityMcpSkipReason,
  buildAntigravityMcpOps,
} from '../../dist-cli/targets/antigravity/mcp-ops';
import { SigilError } from '../../dist-cli/errors';
import { loadResolvedCatalog } from '../helpers/catalog';
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
    const catalog = await loadResolvedCatalog();
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
    const catalog = await loadResolvedCatalog();
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
        'project — .agents/mcp_config.json, git-committed',
        'user — ~/.gemini/config/mcp_config.json, all projects',
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
